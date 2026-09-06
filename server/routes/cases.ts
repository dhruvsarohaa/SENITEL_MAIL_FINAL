import { Router } from "express";
import pool from "../db/connection.js";
import { sendContainmentAlert } from "../services/containment.js";
import { generateForensicPdf } from "../services/pdf-report.js";
import type { Case, CaseSummary, AnalystAction } from "../types.js";

const router = Router();

/** GET /api/cases — List all case summaries, most recent first. */
router.get("/", async (req: any, res: any) => {
  try {
    const orgId = req.tenant?.id;
    const query =
      orgId && orgId !== "sentinel-corp"
        ? `SELECT id, case_number, subject, sender, threat_class, risk_score, severity,
              decision, assigned_action, vendor_name AS vendor, amount_at_risk,
              currency, created_at
       FROM cases WHERE org_id = $1 ORDER BY created_at DESC`
        : `SELECT id, case_number, subject, sender, threat_class, risk_score, severity,
              decision, assigned_action, vendor_name AS vendor, amount_at_risk,
              currency, created_at
       FROM cases ORDER BY created_at DESC`;

    const params = orgId ? [orgId] : [];
    const result = await pool.query<Case>(query, params);
    const summaries: CaseSummary[] = result.rows.map((r) => ({
      id: r.id,
      case_number: r.case_number,
      subject: r.subject,
      sender: r.sender,
      threat_class: r.threat_class,
      risk_score: r.risk_score,
      severity: r.severity,
      decision: r.decision,
      assigned_action: r.assigned_action,
      vendor: (r as any).vendor ?? "—",
      amount_at_risk: r.amount_at_risk,
      triage_minutes:
        (r as any).triage_minutes !== undefined ? Number((r as any).triage_minutes) : undefined,
      currency: r.currency,
      created_at: new Date(r.created_at).toISOString(),
    }));
    res.json(summaries);
  } catch (err) {
    console.error("Failed to list cases:", err);
    res.status(500).json({ message: "Failed to retrieve cases." });
  }
});

/** GET /api/cases/:caseId — Full case detail. */
router.get("/:caseId", async (req: any, res: any) => {
  try {
    const orgId = req.tenant?.id;
    const { caseId } = req.params;

    let query = `SELECT c.*, v.name AS vendor_name_joined
                 FROM cases c LEFT JOIN vendors v ON c.vendor_id = v.id
                WHERE (c.id::text = $1 OR c.case_number = $1)`;
    let params: any[] = [caseId];

    if (orgId ) {
      query += ` AND c.org_id = $2`;
      params.push(orgId);
    }
    query += ` LIMIT 1`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Case not found." });
    }

    const row = result.rows[0] as any;

    // Fetch actions for this case
    const actionsResult = await pool.query(
      "SELECT type, note, analyst, created_at FROM actions WHERE case_id = $1 ORDER BY created_at",
      [row.id],
    );

    const kase: Case = {
      id: row.id,
      case_number: row.case_number,
      subject: row.subject,
      sender: row.sender,
      threat_class: row.threat_class,
      risk_score: row.risk_score,
      severity: row.severity,
      decision: row.decision,
      assigned_action: row.assigned_action,
      vendor: row.vendor_name ?? row.vendor_name_joined ?? "—",
      amount_at_risk: row.amount_at_risk ? Number(row.amount_at_risk) : undefined,
      triage_minutes: row.triage_minutes !== undefined ? Number(row.triage_minutes) : undefined,
      currency: row.currency ?? undefined,
      created_at: new Date(row.created_at).toISOString(),
      confidence: row.confidence,
      decision_banner: row.decision_banner ?? "",
      recipients: row.recipients ?? [],
      body_preview: row.body_preview ?? undefined,
      evidence: row.evidence,
      timeline: row.timeline ?? [],
      relay_path: row.relay_path ?? [],
      campaign_id: row.campaign_id ?? undefined,
      campaign_graph: row.campaign_graph ?? undefined,
      actions: actionsResult.rows.map((a: any) => ({
        type: a.type,
        note: a.note ?? undefined,
        analyst: a.analyst ?? undefined,
        created_at: new Date(a.created_at).toISOString(),
      })),
    };

    res.json(kase);
  } catch (err) {
    console.error("Failed to get case:", err);
    res.status(500).json({ message: "Failed to retrieve case." });
  }
});

/** POST /api/cases/:caseId/action — Record an analyst action. */
router.post("/:caseId/action", async (req, res) => {
  try {
    const { caseId } = req.params;
    const action = req.body as AnalystAction;

    // Find the case
    const caseResult = await pool.query("SELECT * FROM cases WHERE id::text = $1 OR case_number = $1", [
      caseId,
    ]);
    if (caseResult.rows.length === 0) {
      return res.status(404).json({ message: "Case not found." });
    }
    const row = caseResult.rows[0] as any;

    // Insert the action
    await pool.query("INSERT INTO actions (case_id, type, note, analyst) VALUES ($1, $2, $3, $4)", [
      row.id,
      action.type,
      action.note ?? null,
      action.analyst ?? null,
    ]);

    // Update case decision and calculate triage minutes
    const decisions: Record<string, string> = {
      hold_payment: "payment_held",
      mark_safe: "safe",
      escalate: "escalated",
      confirm_threat: "confirmed_threat",
    };
    const newDecision = decisions[action.type] ?? "pending";
    const createdAtTime = row.created_at ? new Date(row.created_at).getTime() : Date.now();
    const triageMinutes = Math.max(1, Math.round((Date.now() - createdAtTime) / 60000));

    await pool.query(
      "UPDATE cases SET decision = $1, triage_minutes = $2, updated_at = now() WHERE id = $3",
      [newDecision, triageMinutes, row.id],
    );

    // Send containment alert for hold_payment and escalate actions
    if (action.type === "hold_payment" || action.type === "escalate") {
      sendContainmentAlert({
        caseNumber: row.case_number,
        subject: row.subject,
        sender: row.sender,
        riskScore: row.risk_score,
        severity: row.severity,
        vendor: row.vendor_name,
        amountAtRisk: row.amount_at_risk ? Number(row.amount_at_risk) : undefined,
        currency: row.currency,
        decisionBanner: row.decision_banner ?? "",
        actionType: action.type,
        analystNote: action.note,
      }).catch((err) => console.error("Containment alert error:", err));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to submit action:", err);
    res.status(500).json({ message: "Failed to record action." });
  }
});

/** GET /api/cases/:caseId/report — Generate a forensic PDF or plain-text report. */
router.get("/:caseId/report", async (req, res) => {
  try {
    const { caseId } = req.params;
    const result = await pool.query("SELECT * FROM cases WHERE id::text = $1 OR case_number = $1", [
      caseId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Case not found." });
    }
    const row = result.rows[0] as any;
    const timeline = (row.timeline ?? []) as { title: string; description: string }[];

    // If client requests PDF or no specific text/plain header is requested, generate PDF
    const acceptsPdf =
      req.headers.accept?.includes("application/pdf") ||
      !req.headers.accept?.includes("text/plain");
    if (acceptsPdf) {
      try {
        const pdfBuffer = await generateForensicPdf(row);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${row.case_number}-forensic-report.pdf"`,
        );
        return res.send(pdfBuffer);
      } catch (pdfErr) {
        console.warn("PDF generation failed, falling back to text report:", pdfErr);
      }
    }

    const report = [
      "SentinelMail Forensic Report",
      "═".repeat(40),
      `Case: ${row.case_number}`,
      `Subject: ${row.subject}`,
      `Sender: ${row.sender}`,
      `Risk: ${row.risk_score}/100 (${row.severity})`,
      `Classification: ${row.threat_class}`,
      `Confidence: ${(row.confidence * 100).toFixed(0)}%`,
      `Decision: ${row.decision}`,
      "",
      row.decision_banner,
      "",
      "Evidence Timeline",
      "─".repeat(30),
      ...timeline.map((e: any) => `• ${e.title}: ${e.description}`),
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(report);
  } catch (err) {
    console.error("Failed to generate report:", err);
    res.status(500).json({ message: "Report generation failed." });
  }
});

export default router;
