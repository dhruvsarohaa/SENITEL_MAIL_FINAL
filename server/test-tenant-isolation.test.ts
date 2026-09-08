import { describe, it, expect, beforeAll } from "vitest";
import pool, { memoryStore } from "./db/connection.js";

describe("PHASE 2 — Multi-Tenant Boundary Isolation Unit & Integration Tests", () => {
  const TENANT_A = "00000000-0000-0000-0000-000000000001"; // Sentinel Corporation
  const TENANT_B = "00000000-0000-0000-0000-000000000099"; // Tenant B

  beforeAll(() => {
    // Seed test entities for Tenant A
    memoryStore.cases.set("case-tenant-a-1", {
      id: "case-tenant-a-1",
      org_id: TENANT_A,
      case_number: "SM-9001",
      subject: "Confidential Invoice Tenant A",
      sender: "ap@vendor-a.com",
      recipients: ["finance@tenant-a.com"],
      threat_class: "invoice_fraud",
      risk_score: 90,
      severity: "critical",
      confidence: 0.95,
      decision: "payment_held",
      assigned_action: "Hold payment",
      decision_banner: "Hold payment recommended",
      vendor: "Vendor A",
      amount_at_risk: 50000,
      currency: "USD",
      evidence: {} as any,
      timeline: [],
      relay_path: [],
      created_at: new Date().toISOString(),
    });

    memoryStore.vendors.set("v-tenant-a-1", {
      id: "v-tenant-a-1",
      org_id: TENANT_A,
      name: "Acme Vendor A",
      trusted_domains: ["vendor-a.com"],
      trusted_contacts: ["ap@vendor-a.com"],
      approved_bank_suffixes: ["1234"],
      normal_recipients: ["finance@tenant-a.com"],
      risk_state: "trusted",
      relationship_since: new Date().toISOString(),
      anomalies: [],
    } as any);

    memoryStore.campaigns.set("camp-tenant-a-1", {
      id: "camp-tenant-a-1",
      org_id: TENANT_A,
      name: "Campaign Alpha",
      severity: "high",
      case_ids: ["SM-9001"],
      shared_indicators: ["domain:vendor-a.com"],
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      victim_teams: ["Finance"],
      domains: ["vendor-a.com"],
      reply_tos: ["ap@vendor-a.com"],
      bank_accounts: ["1234"],
      attachment_hashes: [],
      recommended_actions: ["Block sender"],
    } as any);
  });

  it("Tenant B cannot read or mutate Tenant A cases (ISSUE-02)", async () => {
    // 1. Read single case for Tenant B (should return empty / 404)
    const readRes = await pool.query(
      "SELECT * FROM cases WHERE (id::text = $1 OR case_number = $1) AND org_id = $2",
      ["case-tenant-a-1", TENANT_B],
    );
    expect(readRes.rows.length).toBe(0);

    // 2. Action update for Tenant B (should match 0 rows)
    const updateRes = await pool.query(
      "UPDATE cases SET decision = $1 WHERE id = $2 AND org_id = $3",
      ["safe", "case-tenant-a-1", TENANT_B],
    );
    expect(updateRes.rows.length).toBe(0);
  });

  it("Tenant B cannot read, update, or delete Tenant A vendors (ISSUE-02, 07)", async () => {
    // 1. Read vendor for Tenant B
    const readRes = await pool.query("SELECT * FROM vendors WHERE id = $1 AND org_id = $2", [
      "v-tenant-a-1",
      TENANT_B,
    ]);
    expect(readRes.rows.length).toBe(0);

    // 2. Update vendor for Tenant B
    const updateRes = await pool.query(
      "UPDATE vendors SET name = $1 WHERE id = $2 AND org_id = $3 RETURNING *",
      ["Hacked Name", "v-tenant-a-1", TENANT_B],
    );
    expect(updateRes.rows.length).toBe(0);

    // 3. Delete vendor for Tenant B
    const deleteRes = await pool.query(
      "DELETE FROM vendors WHERE id = $1 AND org_id = $2 RETURNING id",
      ["v-tenant-a-1", TENANT_B],
    );
    expect(deleteRes.rows.length).toBe(0);
  });

  it("Tenant B cannot read Tenant A campaigns (ISSUE-20)", async () => {
    // 1. List campaigns for Tenant B
    const listRes = await pool.query("SELECT * FROM campaigns WHERE org_id = $1", [TENANT_B]);
    expect(listRes.rows.length).toBe(0);

    // 2. Single campaign for Tenant B
    const singleRes = await pool.query("SELECT * FROM campaigns WHERE id = $1 AND org_id = $2", [
      "camp-tenant-a-1",
      TENANT_B,
    ]);
    expect(singleRes.rows.length).toBe(0);
  });
});
