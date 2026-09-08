import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import pool from "../db/connection.js";
import type { VendorProfile } from "../types.js";

const router = Router();

/** GET /api/vendors — List all vendor profiles. */
router.get("/", async (req: any, res: any) => {
  try {
    const orgId = req.tenant?.id || "00000000-0000-0000-0000-000000000001";
    const query = "SELECT * FROM vendors WHERE org_id = $1 ORDER BY name";
    const params = [orgId];

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
    const orgId = req.tenant?.id || "00000000-0000-0000-0000-000000000001";
    const query = "SELECT * FROM vendors WHERE id = $1 AND org_id = $2";
    const params = [req.params.vendorId, orgId];

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found." });
    }
    const r = result.rows[0] as any;

    // Also fetch related case IDs for this vendor & tenant
    const casesResult = await pool.query<{ id: string }>(
      "SELECT id FROM cases WHERE vendor_id = $1 AND org_id = $2 ORDER BY created_at DESC LIMIT 20",
      [r.id, orgId],
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

    const orgId = req.tenant?.id || "00000000-0000-0000-0000-000000000001";
    const result = await pool.query(
      `INSERT INTO vendors (name, trusted_domains, trusted_contacts, approved_bank_suffixes,
        normal_recipients, relationship_since, org_id)
       VALUES ($1, $2, $3, $4, $5, now(), $6)
       RETURNING *`,
      [
        body.name.trim(),
        body.trusted_domains ?? [],
        body.trusted_contacts ?? [],
        body.approved_bank_suffixes ?? [],
        body.normal_recipients ?? [],
        orgId,
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
    const orgId = req.tenant?.id || "00000000-0000-0000-0000-000000000001";
    const query = `UPDATE vendors SET
        name = COALESCE($1, name),
        trusted_domains = COALESCE($2, trusted_domains),
        trusted_contacts = COALESCE($3, trusted_contacts),
        approved_bank_suffixes = COALESCE($4, approved_bank_suffixes),
        normal_recipients = COALESCE($5, normal_recipients),
        updated_at = now()
       WHERE id = $6 AND org_id = $7
       RETURNING *`;
    const params: any[] = [
      body.name ?? null,
      body.trusted_domains ?? null,
      body.trusted_contacts ?? null,
      body.approved_bank_suffixes ?? null,
      body.normal_recipients ?? null,
      req.params.vendorId,
      orgId,
    ];

    const result = await pool.query(query, params);
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

/** DELETE /api/vendors/:vendorId — Delete a vendor profile (Admin only). */
router.delete("/:vendorId", requireRole(["admin"]), async (req: any, res: any) => {
  try {
    const orgId = req.tenant?.id || "00000000-0000-0000-0000-000000000001";
    const query = "DELETE FROM vendors WHERE id = $1 AND org_id = $2 RETURNING id";
    const params = [req.params.vendorId, orgId];

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Vendor not found." });
    }
    res.json({ ok: true, deleted: req.params.vendorId });
  } catch (err) {
    console.error("Failed to delete vendor:", err);
    res.status(500).json({ message: "Failed to delete vendor." });
  }
});

export default router;
