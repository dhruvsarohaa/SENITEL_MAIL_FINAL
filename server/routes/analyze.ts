import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import pool from "../db/connection.js";
import { analyzeEml, address, domain } from "../services/eml-parser.js";
import { compareBehavior } from "../services/behavioral.js";
import { classifyEmail } from "../services/classifier.js";
import { fuseScores } from "../services/scoring.js";
import { extractAndCorrelate } from "../services/campaign.js";
import type { VendorProfile, Case } from "../types.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = Router();

// Simple in-memory rate limiter for analyze uploads (10 uploads per minute per IP)
const analyzeRateLimits = new Map<string, { count: number; resetAt: number }>();
function rateLimiter(req: any, res: any, next: any) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const record = analyzeRateLimits.get(ip);
  if (!record || now > record.resetAt) {
    analyzeRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
  } else {
    record.count++;
    if (record.count > 10) {
      return res
        .status(429)
        .json({ message: "Too many analysis requests, please try again later." });
    }
  }
  next();
}

/**
 * POST /api/analyze — Upload and analyze an .eml file.
 * Full pipeline: parse → classify → behavioral comparison → score fusion → campaign correlation → persist.
 */
router.post("/", rateLimiter, upload.single("file"), async (req: any, res: any) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "A .eml file is required." });
    if (!file.originalname.toLowerCase().endsWith(".eml")) {
      return res.status(400).json({ message: "Only .eml files are supported." });
    }

    const vendorId = req.body?.vendor_id as string | undefined;

    // Fetch vendors from DB
    const vendorsResult = await pool.query<VendorProfile>("SELECT * FROM vendors ORDER BY name");
    const vendors = vendorsResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      trusted_domains: r.trusted_domains ?? [],
      trusted_contacts: r.trusted_contacts ?? [],
      approved_bank_suffixes: r.approved_bank_suffixes ?? [],
      normal_recipients: r.normal_recipients ?? [],
      risk_state: r.risk_state as VendorProfile["risk_state"],
      last_interaction: r.last_interaction
        ? new Date(r.last_interaction as unknown as string).toISOString()
        : undefined,
      relationship_since: r.relationship_since
        ? new Date(r.relationship_since as unknown as string).toISOString()
        : undefined,
      anomalies: (r.anomalies as unknown as VendorProfile["anomalies"]) ?? [],
    }));

    // Get next case number from sequence
    const seqResult = await pool.query<{ nextval: string }>("SELECT nextval('case_number_seq')");
    const caseNumber = `SM-${seqResult.rows[0]!.nextval}`;

    // Step 1: Parse and do initial rule-based analysis
    const emlBytes = file.buffer;
    const kase = await analyzeEml({
      bytes: Buffer.from(emlBytes),
      filename: file.originalname,
      vendors,
      vendorId: vendorId || undefined,
      caseNumber,
    });

    // Find the matched vendor
    const senderAddr = kase.evidence.sender_identity.from_address;
    const senderDomain = domain(senderAddr) || "";
    const matchedVendor =
      vendors.find((v) => v.id === vendorId) ??
      vendors.find((v) => v.trusted_domains.includes(senderDomain)) ??
      vendors.find((v) =>
        v.trusted_domains.some(
          (d) =>
            senderDomain.includes(d.split(".")[0] || "___") ||
            d.includes(senderDomain.split(".")[0] || "___"),
        ),
      ) ??
      null;

    if (matchedVendor && kase.vendor === "—") {
      kase.vendor = matchedVendor.name;
    }

    // Step 2: AI-assisted classification
    const classResult = await classifyEmail({
      subject: kase.subject,
      bodyText: kase.body_preview ?? "",
      attachments: kase.evidence.technical.attachments.map((a) => ({
        filename: a.filename,
        suspicious: a.suspicious ?? false,
      })),
      senderDomain,
      hasPaymentChange: kase.evidence.financial.payment_change_requested ?? false,
      hasNewBankAccount: kase.evidence.financial.bank_account_known === false,
    });

    // Step 3: Behavioral comparison
    const behaviorResult = await compareBehavior({
      pool,
      vendor: matchedVendor,
      senderAddress: senderAddr,
      senderDomain,
      replyTo: kase.evidence.sender_identity.reply_to ?? "",
      recipients: kase.recipients ?? [],
      bankAccountLast4: kase.evidence.financial.bank_account_last4,
      bodyText: kase.body_preview ?? "",
      sentAt: new Date(),
    });

    // Override classification if AI provides a different answer
    if (classResult.final.classification !== kase.threat_class) {
      kase.threat_class = classResult.final.classification;
    }

    // Add AI overlay insights to evidence and timeline if available
    if (classResult.aiOverlay) {
      kase.evidence.intent.model_confidence = classResult.aiOverlay.confidence;
      const providerLabel =
        classResult.aiOverlay.provider === "gemini"
          ? "Google Gemini 2.5 Flash"
          : "OpenAI GPT-4o-mini";
      kase.evidence.intent.signals.unshift({
        label: `${providerLabel} Intent Analysis: ${classResult.aiOverlay.classification.replace(/_/g, " ")}`,
        detail:
          classResult.aiOverlay.reasoning ??
          (classResult.aiOverlay.phrases.length > 0
            ? `Key phrases: ${classResult.aiOverlay.phrases.join(", ")}`
            : undefined),
        severity: classResult.aiOverlay.classification === "benign" ? "safe" : "critical",
        weight: 0.35,
      });
      kase.timeline.unshift({
        order: 0,
        title: `${providerLabel}: ${classResult.aiOverlay.classification.replace(/_/g, " ")}`,
        description:
          classResult.aiOverlay.reasoning ??
          (classResult.aiOverlay.phrases.length > 0
            ? `Identified phrases: ${classResult.aiOverlay.phrases.join(", ")}`
            : "AI model classification completed."),
        severity: classResult.aiOverlay.classification === "benign" ? "safe" : "critical",
        weight: 0.35,
      });
    }

    // Add behavioral signals to the evidence and timeline
    if (behaviorResult.signals.length > 0) {
      kase.evidence.intent.signals.push(...behaviorResult.signals);
      for (const sig of behaviorResult.signals) {
        kase.timeline.push({
          order: kase.timeline.length + 1,
          title: sig.label,
          description: sig.detail ?? "Behavioral comparison against vendor baseline.",
          severity: sig.severity ?? "medium",
          weight: sig.weight,
        });
      }
    }

    // Override or populate vendor relationship from behavioral engine / matched vendor
    if (behaviorResult.vendorRelationship) {
      kase.evidence.vendor_relationship = behaviorResult.vendorRelationship;
    } else if (matchedVendor) {
      kase.evidence.vendor_relationship = {
        trusted_domain: matchedVendor.trusted_domains[0] ?? senderDomain,
        known_contact: matchedVendor.trusted_contacts[0] ?? senderAddr,
        approved_bank_suffixes: matchedVendor.approved_bank_suffixes,
        normal_recipients: matchedVendor.normal_recipients,
      };
      kase.evidence.sender_identity.trusted_vendor = matchedVendor.name;
      kase.evidence.sender_identity.vendor_domain_match =
        matchedVendor.trusted_domains.includes(senderDomain);
    }

    // Step 4: Score fusion
    const fused = fuseScores({
      ruleBasedScore: kase.risk_score,
      behavioralDelta: behaviorResult.scoreDelta,
      campaignMatchCount: 0, // Will be updated after campaign correlation
      aiAgrees: classResult.aiOverlay?.agrees,
    });

    kase.risk_score = fused.finalScore;
    kase.confidence = fused.finalConfidence;
    kase.severity =
      fused.finalScore >= 80
        ? "critical"
        : fused.finalScore >= 60
          ? "high"
          : fused.finalScore >= 35
            ? "medium"
            : fused.finalScore > 0
              ? "low"
              : "safe";

    // Recalculate decision banner
    const shouldHold =
      kase.threat_class === "invoice_fraud" &&
      (kase.evidence.financial.payment_change_requested ||
        Boolean(kase.evidence.financial.bank_account_last4));
    kase.assigned_action = shouldHold ? "Hold payment" : "Review required";
    kase.decision_banner = shouldHold
      ? "Hold payment recommended — payment-change evidence requires out-of-band verification"
      : kase.severity === "safe"
        ? "No high-risk indicators found in the uploaded email"
        : "Review required — investigate the evidence before acting";

    // Compute EML hash for dedup
    const emlHash = crypto.createHash("sha256").update(emlBytes).digest("hex");

    // Find vendor_id for DB storage
    const dbVendorId = matchedVendor?.id ?? null;

    // Step 5: Persist case to PostgreSQL
    await pool.query(

      `INSERT INTO cases (id, org_id, case_number, subject, sender, recipients, threat_class, risk_score,
        severity, confidence, decision, assigned_action, decision_banner, vendor_id, vendor_name,
        amount_at_risk, currency, body_preview, evidence, timeline, relay_path,
        raw_eml, eml_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,$23)`,
      [
        kase.id,
        req.tenant.id,
        kase.case_number,
        kase.subject,
        kase.sender,
        kase.recipients ?? [],
        kase.threat_class,
        kase.risk_score,
        kase.severity,
        kase.confidence,
        kase.decision,
        kase.assigned_action,
        kase.decision_banner,
        dbVendorId,
        kase.vendor,
        kase.amount_at_risk ?? null,
        kase.currency ?? null,
        kase.body_preview ?? null,
        JSON.stringify(kase.evidence),
        JSON.stringify(kase.timeline),
        JSON.stringify(kase.relay_path),
        emlBytes,
        emlHash,
      ],
    );

    // Step 6: Campaign correlation
    const campaignResult = await extractAndCorrelate({
      pool,
      caseId: kase.id,
      caseNumber: kase.case_number,
      domains: kase.evidence.technical.domains,
      urls: kase.evidence.technical.urls,
      replyTo: kase.evidence.sender_identity.reply_to ?? "",
      bankAccountLast4: kase.evidence.financial.bank_account_last4,
      attachmentHashes: kase.evidence.technical.attachments
        .map((a) => a.sha256)
        .filter((h): h is string => !!h),
      relayIps: kase.evidence.technical.relay_ips,
    });

    if (campaignResult.campaignId) {
      kase.campaign_id = campaignResult.campaignId;
      kase.campaign_graph = campaignResult.campaignGraph;

      // Re-fuse score with campaign data
      const refused = fuseScores({
        ruleBasedScore: fused.ruleBasedScore,
        behavioralDelta: fused.behavioralDelta,
        campaignMatchCount: campaignResult.matchCount,
        aiAgrees: classResult.aiOverlay?.agrees,
      });
      kase.risk_score = refused.finalScore;
      kase.confidence = refused.finalConfidence;

      // Update the case in DB with campaign data and re-fused score
      await pool.query(
        `UPDATE cases SET campaign_id = $1, campaign_graph = $2, risk_score = $3, confidence = $4, updated_at = now() WHERE id = $5`,
        [
          campaignResult.campaignId,
          JSON.stringify(campaignResult.campaignGraph),
          refused.finalScore,
          refused.finalConfidence,
          kase.id,
        ],
      );
    }

    // Update vendor last_interaction
    if (dbVendorId) {
      await pool.query(
        "UPDATE vendors SET last_interaction = now(), updated_at = now() WHERE id = $1",
        [dbVendorId],
      );
      // Record anomalies on the vendor
      if (behaviorResult.anomalies.length > 0) {
        const existingAnomalies = matchedVendor?.anomalies ?? [];
        const combined = [...existingAnomalies, ...behaviorResult.anomalies].slice(-20); // Keep last 20
        const riskState =
          behaviorResult.scoreDelta >= 28
            ? "at_risk"
            : behaviorResult.scoreDelta >= 12
              ? "watch"
              : "trusted";
        await pool.query(
          "UPDATE vendors SET anomalies = $1, risk_state = $2, updated_at = now() WHERE id = $3",
          [JSON.stringify(combined), riskState, dbVendorId],
        );
      }
    }

    res.status(201).json({ case_id: kase.id, case: kase });
  } catch (err) {
    console.error("Analysis failed:", err);
    const message = err instanceof Error ? err.message : "Unable to analyze this email.";
    res.status(422).json({ message });
  }
});

export default router;
