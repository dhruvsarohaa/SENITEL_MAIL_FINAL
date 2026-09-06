import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import pool from "../db/connection.js";
import type { VendorProfile } from "../types.js";

const router = Router();

/** GET /api/vendors — List all vendor profiles. */
router.get("/", async (req: any, res: any) => {
  try {
    // Tenant isolation: only fetch vendors for this tenant (or all if not enterprise)
    const orgId = req.tenant?.id;
    const query =
      orgId && orgId !== "sentinel-corp"
        ? "SELECT * FROM vendors WHERE org_id = $1 ORDER BY name"
        : "SELECT * FROM vendors ORDER BY name";
    const params = orgId && orgId !== "sentinel-corp" ? [orgId] : [];

    const result = await pool.query(query, params);
    const vendors: VendorProfile[] = result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      trusted_domains: r.trusted_domains ?? [],
      trusted_contacts: r.trusted_contacts ?? [],
      approved_bank_suffixes: r.approved_bank_suffixes ?? [],
      normal_recipients: r.normal_recipients ?? [],
      risk_state: r.risk_state ?? "trusted",
      last_interaction: r.last_interaction ? new Date(r.last_interaction).toISOString() : undefined,
      relationship_since: r.relationship_since
        ? new Date(r.relationship_since).toISOString()
        : undefined,
      anomalies: r.anomalies ?? [],
    }));
    res.json(vendors);
  } catch (err) {
    console.error("Failed to list vendors:", err);
    res.status(500).json({ message: "Failed to retrieve vendors." });
  }
});

/** GET /api/vendors/:vendorId — Get a single vendor profile. */
router.get("/:vendorId", async (req: any, res: any) => {
  try {
    const orgId = req.tenant?.id;
    const query =
      orgId && orgId !== "sentinel-corp"
        ? "SELECT * FROM vendors WHERE id = $1 AND org_id = $2"
        : "SELECT * FROM vendors WHERE id = $1";
    const params =
      orgId && orgId !== "sentinel-corp" ? [req.params.vendorId, orgId] : [req.params.vendorId];

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found." });
    }
    const r = result.rows[0] as any;

    // Also fetch related case IDs
    const casesResult = await pool.query<{ id: string }>(
      "SELECT id FROM cases WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT 20",
      [r.id],
    );
    const vendor: VendorProfile = {
      id: r.id,
      name: r.name,
      trusted_domains: r.trusted_domains ?? [],
      trusted_contacts: r.trusted_contacts ?? [],
      approved_bank_suffixes: r.approved_bank_suffixes ?? [],
      normal_recipients: r.normal_recipients ?? [],
      related_case_ids: casesResult.rows.map((c) => c.id),
      risk_state: r.risk_state ?? "trusted",
      last_interaction: r.last_interaction ? new Date(r.last_interaction).toISOString() : undefined,
      relationship_since: r.relationship_since
        ? new Date(r.relationship_since).toISOString()
        : undefined,
      anomalies: r.anomalies ?? [],
    };
    res.json(vendor);
  } catch (err) {
    console.error("Failed to get vendor:", err);
    res.status(500).json({ message: "Failed to retrieve vendor." });
  }
});

/** POST /api/vendors — Create a new vendor profile. */
router.post("/", requireRole(["analyst"]), async (req: any, res: any) => {
  try {
    const body = req.body as Omit<VendorProfile, "id">;
    if (!body.name?.trim()) {
      return res.status(400).json({ message: "Vendor name is required." });
    }

    const result = await pool.query(
      `INSERT INTO vendors (name, trusted_domains, trusted_contacts, approved_bank_suffixes,
        normal_recipients, relationship_since)
       VALUES ($1, $2, $3, $4, $5, now())
       RETURNING *`,
      [
        body.name.trim(),
        body.trusted_domains ?? [],
        body.trusted_contacts ?? [],
        body.approved_bank_suffixes ?? [],
        body.normal_recipients ?? [],
      ],
    );

    const r = result.rows[0] as any;
    const vendor: VendorProfile = {
      id: r.id,
      name: r.name,
      trusted_domains: r.trusted_domains ?? [],
      trusted_contacts: r.trusted_contacts ?? [],
      approved_bank_suffixes: r.approved_bank_suffixes ?? [],
      normal_recipients: r.normal_recipients ?? [],
      risk_state: r.risk_state ?? "trusted",
      relationship_since: r.relationship_since
        ? new Date(r.relationship_since).toISOString()
        : undefined,
      anomalies: [],
    };
    res.status(201).json(vendor);
  } catch (err) {
    console.error("Failed to create vendor:", err);
    res.status(500).json({ message: "Failed to create vendor." });
  }
});

/** PUT /api/vendors/:vendorId — Update a vendor profile. */
router.put("/:vendorId", requireRole(["analyst"]), async (req: any, res: any) => {
  try {
    const body = req.body as Partial<VendorProfile>;
    const result = await pool.query(
      `UPDATE vendors SET
        name = COALESCE($1, name),
        trusted_domains = COALESCE($2, trusted_domains),
        trusted_contacts = COALESCE($3, trusted_contacts),
        approved_bank_suffixes = COALESCE($4, approved_bank_suffixes),
        normal_recipients = COALESCE($5, normal_recipients),
        updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [
        body.name ?? null,
        body.trusted_domains ?? null,
        body.trusted_contacts ?? null,
        body.approved_bank_suffixes ?? null,
        body.normal_recipients ?? null,
        req.params.vendorId,
      ],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found." });
    }
    const r = result.rows[0] as any;
    res.json({
      id: r.id,
      name: r.name,
      trusted_domains: r.trusted_domains ?? [],
      trusted_contacts: r.trusted_contacts ?? [],
      approved_bank_suffixes: r.approved_bank_suffixes ?? [],
      normal_recipients: r.normal_recipients ?? [],
      risk_state: r.risk_state,
      anomalies: r.anomalies ?? [],
    });
  } catch (err) {
    console.error("Failed to update vendor:", err);
    res.status(500).json({ message: "Failed to update vendor." });
  }
});

export default router;
