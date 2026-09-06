import crypto from "node:crypto";
import pool from "../db/connection.js";
import { analyzeEml, domain } from "./eml-parser.js";
import { compareBehavior } from "./behavioral.js";
import { classifyEmail } from "./classifier.js";
import { fuseScores } from "./scoring.js";
import { extractAndCorrelate } from "./campaign.js";
import { sendContainmentAlert } from "./containment.js";

/**
 * Enterprise Mailbox Ingestion Processor
 * Continuously parses, analyzes, scores, and auto-contains inbound messages
 * received from Microsoft 365 or Google Workspace connectors.
 */
export async function processIngestedMessage({
  rawBytes,
  filename,
  tenantId,
  connectorId,
  provider = "m365",
}) {
  const bytesBuffer = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);

  // 1. Fetch vendor baseline for this tenant
  const vendorsResult = await pool.query("SELECT * FROM vendors");
  const vendors = vendorsResult.rows.map((r) => ({
    id: r.id,
    name: r.name,
    trusted_domains: r.trusted_domains ?? [],
    trusted_contacts: r.trusted_contacts ?? [],
    approved_bank_suffixes: r.approved_bank_suffixes ?? [],
    normal_recipients: r.normal_recipients ?? [],
    risk_state: r.risk_state,
    last_interaction: r.last_interaction,
    anomalies: r.anomalies ?? [],
  }));

  // 2. Generate sequential case identifier
  let caseSeq = Date.now().toString().slice(-4);
  try {
    const seqResult = await pool.query("SELECT nextval('case_number_seq')");
    if (seqResult.rows && seqResult.rows[0]) {
      caseSeq = seqResult.rows[0].nextval;
    }
  } catch {
    // Fallback to timestamp sequence
  }
  const caseNumber = `SM-${caseSeq}`;

  // 3. Parse and extract message metadata
  const kase = await analyzeEml({
    bytes: bytesBuffer,
    filename: filename || `${provider}-message-${Date.now()}.eml`,
    vendors,
    caseNumber,
  });

  kase.org_id = tenantId;
  kase.connector_id = connectorId;

  // 4. Auto-match vendor
  const senderAddr = kase.evidence.sender_identity.from_address;
  const senderDomain = domain(senderAddr) || "";
  const matchedVendor =
    vendors.find((v) => v.trusted_domains.includes(senderDomain)) ||
    vendors.find((v) =>
      v.trusted_domains.some((d) => senderDomain.includes(d.split(".")[0] || "___")),
    ) ||
    null;

  if (matchedVendor && kase.vendor === "—") {
    kase.vendor = matchedVendor.name;
  }

  // 5. Run AI classification layer
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

  if (classResult.final.classification !== kase.threat_class) {
    kase.threat_class = classResult.final.classification;
  }

  // 6. Run Vendor Behavioral Engine
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

  if (behaviorResult.vendorRelationship) {
    kase.evidence.vendor_relationship = behaviorResult.vendorRelationship;
  } else if (matchedVendor) {
    kase.evidence.vendor_relationship = {
      trusted_domain: matchedVendor.trusted_domains[0] ?? senderDomain,
      known_contact: matchedVendor.trusted_contacts[0] ?? senderAddr,
      approved_bank_suffixes: matchedVendor.approved_bank_suffixes,
      normal_recipients: matchedVendor.normal_recipients,
    };
  }

  // 7. Fuse Risk Score
  const fused = fuseScores({
    ruleBasedScore: kase.risk_score,
    behavioralDelta: behaviorResult.scoreDelta,
    campaignMatchCount: 0,
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
          : "safe";

  // 8. Automated Enterprise Policy Enforcement (Autonomous Containment)
  const isInvoiceThreat = kase.threat_class === "invoice_fraud";
  const hasPaymentChange = Boolean(
    kase.evidence.financial.payment_change_requested || kase.evidence.financial.bank_account_last4,
  );
  const shouldAutoHold = (isInvoiceThreat && hasPaymentChange) || kase.risk_score >= 85;

  let autoActionTaken = false;
  if (shouldAutoHold) {
    kase.decision = "payment_held";
    kase.assigned_action = "Hold payment";
    kase.decision_banner = "AUTOMATED CONTAINMENT: Payment hold initiated upon mailbox delivery";
    autoActionTaken = true;

    // Dispatch real-time containment alert
    sendContainmentAlert({
      caseNumber: kase.case_number,
      subject: kase.subject,
      sender: kase.sender,
      riskScore: kase.risk_score,
      severity: kase.severity,
      vendor: kase.vendor,
      amountAtRisk: kase.amount_at_risk,
      currency: kase.currency,
      decisionBanner: kase.decision_banner,
      actionType: "hold_payment",
      analystNote: `Autonomous inline containment via ${provider.toUpperCase()} connector.`,
    }).catch((err) => console.error("Automated containment alert failed:", err));
  }

  // 9. Persist to Database / MemoryStore
  const emlHash = crypto.createHash("sha256").update(bytesBuffer).digest("hex");
  const dbVendorId = matchedVendor?.id ?? null;

  await pool.query(
    `INSERT INTO cases (id, case_number, subject, sender, recipients, threat_class, risk_score,
      severity, confidence, decision, assigned_action, decision_banner, vendor_id, vendor_name,
      amount_at_risk, currency, body_preview, evidence, timeline, relay_path,
      raw_eml, eml_sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
    [
      kase.id,
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
      bytesBuffer,
      emlHash,
    ],
  );

  // 10. Correlate with active campaigns
  await extractAndCorrelate({
    pool,
    caseId: kase.id,
    caseNumber: kase.case_number,
    domains: kase.evidence.technical.domains,
    urls: kase.evidence.technical.urls,
    replyTo: kase.evidence.sender_identity.reply_to ?? "",
    bankAccountLast4: kase.evidence.financial.bank_account_last4,
    attachmentHashes: kase.evidence.technical.attachments.map((a) => a.sha256).filter(Boolean),
    relayIps: kase.evidence.technical.relay_ips,
  }).catch((err) => console.error("Campaign correlation error:", err));

  return {
    case_id: kase.id,
    case: kase,
    auto_action_taken: autoActionTaken,
  };
}
