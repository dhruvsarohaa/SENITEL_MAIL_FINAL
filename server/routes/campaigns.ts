import { Router } from "express";
import pool from "../db/connection.js";
import type { Campaign } from "../types.js";

import { isMongoActive } from "../db/mongo.js";

const router = Router();

/** GET /api/campaigns — List all campaign clusters for current tenant. */
router.get("/", async (req: any, res: any) => {
  try {
    const orgId = req.tenant?.id || "00000000-0000-0000-0000-000000000001";
    const query = "SELECT * FROM campaigns WHERE org_id = $1 ORDER BY last_seen DESC";
    const params = [orgId];

    const result = await pool.query(query, params);
    const campaigns: Campaign[] = result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      severity: r.severity,
      case_count: r.case_ids?.length ?? 0,
      shared_indicators: r.shared_indicators ?? [],
      first_seen: new Date(r.first_seen).toISOString(),
      last_seen: new Date(r.last_seen).toISOString(),
      case_ids: r.org_id === orgId ? (r.case_ids ?? []) : [],
      victim_teams: r.org_id === orgId ? (r.victim_teams ?? []) : [],
      domains: r.domains ?? [],
      reply_tos: r.reply_tos ?? [],
      bank_accounts: r.org_id === orgId ? (r.bank_accounts ?? []) : [],
      attachment_hashes: r.attachment_hashes ?? [],
      recommended_actions: r.recommended_actions ?? [],
    }));
    res.json(campaigns);
  } catch (err) {
    console.error("Failed to list campaigns:", err);
    res.status(500).json({ message: "Failed to retrieve campaigns." });
  }
});

/** GET /api/campaigns/:campaignId — Get a single campaign with case summaries. */
router.get("/:campaignId", async (req: any, res: any) => {
  try {
    const orgId = req.tenant?.id || "00000000-0000-0000-0000-000000000001";
    const query = "SELECT * FROM campaigns WHERE id = $1 AND org_id = $2";
    const params = [req.params.campaignId, orgId];

    const campResult = await pool.query(query, params);
    if (campResult.rows.length === 0) {
      return res.status(404).json({ message: "Campaign not found." });
    }
    const r = campResult.rows[0] as any;

    // Fetch case summaries for linked cases owned by this tenant
    const caseIds = r.case_ids ?? [];
    let cases: any[] = [];
    if (caseIds.length > 0) {
      const casesQuery = `SELECT id, case_number, subject, sender, threat_class, risk_score, severity,
                decision, assigned_action, vendor_name AS vendor, amount_at_risk, currency, created_at
         FROM cases WHERE case_number = ANY($1) AND org_id = $2
         ORDER BY created_at DESC`;
      const casesResult = await pool.query(casesQuery, [caseIds, orgId]);
      cases = casesResult.rows.map((c: any) => ({
        id: c.id,
        case_number: c.case_number,
        subject: c.subject,
        sender: c.sender,
        threat_class: c.threat_class,
        risk_score: c.risk_score,
        severity: c.severity,
        decision: c.decision,
        assigned_action: c.assigned_action,
        vendor: c.vendor ?? "—",
        amount_at_risk: c.amount_at_risk ? Number(c.amount_at_risk) : undefined,
        currency: c.currency,
        created_at: new Date(c.created_at).toISOString(),
      }));
    }

    const campaign: Campaign = {
      id: r.id,
      name: r.name,
      severity: r.severity,
      case_count: caseIds.length,
      shared_indicators: r.shared_indicators ?? [],
      first_seen: new Date(r.first_seen).toISOString(),
      last_seen: new Date(r.last_seen).toISOString(),
      case_ids: caseIds,
      cases,
      victim_teams: r.victim_teams ?? [],
      domains: r.domains ?? [],
      reply_tos: r.reply_tos ?? [],
      bank_accounts: r.bank_accounts ?? [],
      attachment_hashes: r.attachment_hashes ?? [],
      recommended_actions: r.recommended_actions ?? [],
    };
    res.json(campaign);
  } catch (err) {
    console.error("Failed to get campaign:", err);
    res.status(500).json({ message: "Failed to retrieve campaign." });
  }
});

export default router;
