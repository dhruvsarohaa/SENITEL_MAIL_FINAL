/**
 * Automated Verification Suite for Enterprise Phase 1 & Phase 2
 * Tests Multi-Tenancy, Tenant Isolation, RBAC, M365 Webhook, and Ingestion.
 */

const BASE_URL = "http://localhost:3001";

async function runTests() {
  console.log("\n==================================================================");
  console.log("  🧪 Running SentinelMail Enterprise Phase 1 & Phase 2 Tests");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ── TEST 1: Default Tenant Resolution (Zero-Breakage Backward Compat) ──
  console.log("1. Testing Default Tenant Resolution & Session Context...");
  const currentRes = await fetch(`${BASE_URL}/api/tenants/current`);
  const currentData = await currentRes.json();
  assert(currentRes.status === 200, "GET /api/tenants/current returned HTTP 200");
  assert(
    currentData.tenant?.slug === "sentinel-corp",
    `Default tenant is 'sentinel-corp' (got ${currentData.tenant?.slug})`,
  );
  assert(currentData.user?.role === "admin", "Default browser session has admin privileges");

  // ── TEST 2: Generate Enterprise API Key ──
  console.log("\n2. Testing Scoped API Key Generation (Admin)...");
  const apiKeyRes = await fetch(`${BASE_URL}/api/tenants/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Automated CI/CD Connector", role: "admin" }),
  });
  const apiKeyData = await apiKeyRes.json();
  assert(apiKeyRes.status === 201, "POST /api/tenants/api-keys returned HTTP 201");
  assert(
    apiKeyData.apiKey?.startsWith("sm_live_"),
    `API key generated with 'sm_live_' prefix (${apiKeyData.prefix})`,
  );
  const adminApiKey = apiKeyData.apiKey;

  // ── TEST 3: Authenticate Using Generated API Key ──
  console.log("\n3. Testing Authentication with Bearer API Key...");
  const authKeyRes = await fetch(`${BASE_URL}/api/tenants/current`, {
    headers: { Authorization: `Bearer ${adminApiKey}` },
  });
  const authKeyData = await authKeyRes.json();
  assert(authKeyRes.status === 200, "Authenticated request with Bearer API key succeeded");
  assert(authKeyData.tenant?.id !== undefined, "Tenant context properly bound to API key");

  // ── TEST 4: RBAC Role Enforcement ──
  console.log("\n4. Testing RBAC Role Enforcement (Analyst Forbidden from Admin Endpoints)...");
  // Generate an analyst key
  const analystKeyRes = await fetch(`${BASE_URL}/api/tenants/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminApiKey}` },
    body: JSON.stringify({ name: "Tier 1 Analyst Key", role: "analyst" }),
  });
  const analystKeyData = await analystKeyRes.json();
  const analystApiKey = analystKeyData.apiKey;

  // Try to generate an API key using the analyst key (should be forbidden)
  const forbiddenRes = await fetch(`${BASE_URL}/api/tenants/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${analystApiKey}` },
    body: JSON.stringify({ name: "Unauthorized Key Attempt" }),
  });
  assert(
    forbiddenRes.status === 403,
    `Analyst blocked with HTTP 403 Forbidden on admin endpoint (got ${forbiddenRes.status})`,
  );

  // ── TEST 5: Tenant Provisioning & Isolation ──
  console.log("\n5. Testing Multi-Tenant Organization Provisioning & Scoping...");
  const newOrgRes = await fetch(`${BASE_URL}/api/tenants/organizations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminApiKey}` },
    body: JSON.stringify({ name: "Acme Financial Logistics", slug: "acme-fin" }),
  });
  const newOrgData = await newOrgRes.json();
  assert(
    newOrgRes.status === 201,
    `Provisioned new tenant 'Acme Financial Logistics' (slug: ${newOrgData.slug})`,
  );

  // Header-based tenant scope
  const tenantScopedRes = await fetch(`${BASE_URL}/api/tenants/current`, {
    headers: { "X-Tenant-ID": "acme-fin" },
  });
  const tenantScopedData = await tenantScopedRes.json();
  assert(
    tenantScopedData.tenant?.slug === "acme-fin",
    `X-Tenant-ID header successfully switched context to '${tenantScopedData.tenant?.slug}'`,
  );

  // ── TEST 6: Microsoft 365 Webhook Subscription Handshake ──
  console.log("\n6. Testing Microsoft 365 Graph Webhook Handshake...");
  const challengeToken = "graph-validation-token-abc123xyz789";
  const handshakeRes = await fetch(
    `${BASE_URL}/api/ingest/m365/webhook?validationToken=${challengeToken}`,
    {
      method: "POST",
    },
  );
  const handshakeText = await handshakeRes.text();
  assert(handshakeRes.status === 200, "M365 Webhook handshake returned HTTP 200");
  assert(
    handshakeText === challengeToken,
    `M365 Webhook echoed validationToken exactly ('${handshakeText}')`,
  );

  // ── TEST 7: Native Automated Mailbox Ingestion & Auto-Containment ──
  console.log("\n7. Testing Automated Inbound Ingestion & Autonomous Containment...");
  const testEmlMessage = [
    'From: "Supply Co Billing" <billing@supplyco-billing.net>',
    "To: ap@astermanufacturing.com",
    "Reply-To: accounts.finance@supplyco-billing.net",
    "Subject: Invoice INV-99014: Bank account details updated for wire transfer",
    "Date: Sun, 06 Sep 2026 01:20:00 +0000",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Dear Finance Team,",
    "",
    "Please note our payment instructions have changed effective immediately.",
    "All wire remittances for invoice INV-99014 ($145,000.00) must be routed to our new bank account ending in 7741.",
    "Beneficiary: SUPPLYCO TRADING LTD.",
    "Please confirm once the wire transfer has been scheduled.",
    "",
    "Regards,",
    "Supply Co Accounts",
  ].join("\r\n");

  const ingestRes = await fetch(`${BASE_URL}/api/ingest/m365/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminApiKey}`,
      "X-Tenant-ID": "sentinel-corp",
    },
    body: JSON.stringify({
      raw_eml: testEmlMessage,
      filename: "m365-urgent-remittance.eml",
    }),
  });

  const ingestData = await ingestRes.json();
  assert(
    ingestRes.status === 201,
    "POST /api/ingest/m365/webhook accepted and processed message (HTTP 201)",
  );
  assert(
    ingestData.case?.case_number !== undefined,
    `Automated case created: ${ingestData.case?.case_number}`,
  );
  assert(
    ingestData.case?.threat_class === "invoice_fraud",
    `Threat classified as '${ingestData.case?.threat_class}'`,
  );
  assert(
    ingestData.case?.decision === "payment_held",
    `Autonomous containment triggered: decision = '${ingestData.case?.decision}'`,
  );
  assert(ingestData.auto_action_taken === true, "Autonomous policy flag: auto_action_taken = true");
  assert(
    ingestData.case?.evidence?.vendor_relationship !== undefined,
    "Vendor relationship baseline automatically linked",
  );

  // ── TEST 8: Mailbox Connectors Status ──
  console.log("\n8. Testing Mailbox Connectors API Status...");
  const connectorsRes = await fetch(`${BASE_URL}/api/ingest/connectors`, {
    headers: { Authorization: `Bearer ${adminApiKey}` },
  });
  const connectors = await connectorsRes.json();
  assert(connectorsRes.status === 200, "GET /api/ingest/connectors returned HTTP 200");
  assert(
    Array.isArray(connectors) && connectors.length >= 2,
    `Active connectors reported (${connectors.length} found)`,
  );
  assert(
    connectors.some((c) => c.provider === "m365"),
    "Microsoft 365 connector is configured and active",
  );
  assert(
    connectors.some((c) => c.provider === "google_workspace"),
    "Google Workspace connector is configured and active",
  );

  // ── TEST 9: Multi-Tenant Data Isolation & Boundary Enforcement ──
  console.log("\n9. Testing Multi-Tenant Data Isolation & Boundary Enforcement...");
  // Provision Tenant B
  const tenantBRes = await fetch(`${BASE_URL}/api/tenants/organizations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminApiKey}` },
    body: JSON.stringify({ name: "Omega Financial Systems", slug: "omega-fin" }),
  });
  const tenantBData = await tenantBRes.json();
  assert(
    tenantBRes.status === 201,
    `Provisioned Tenant B 'Omega Financial Systems' (slug: ${tenantBData.slug})`,
  );

  // Tenant B cannot see Tenant A's cases
  const tenantBCasesRes = await fetch(`${BASE_URL}/api/cases`, {
    headers: { "X-Tenant-ID": "omega-fin" },
  });
  const tenantBCases = await tenantBCasesRes.json();
  assert(tenantBCasesRes.status === 200, "Tenant B GET /api/cases returned HTTP 200");
  assert(
    Array.isArray(tenantBCases) && tenantBCases.length === 0,
    `Tenant B sees 0 cases in their tenant space (got ${tenantBCases.length})`,
  );

  // Tenant B cannot access Tenant A's case detail (returns 404)
  const crossCaseRes = await fetch(`${BASE_URL}/api/cases/c-1042`, {
    headers: { "X-Tenant-ID": "omega-fin" },
  });
  assert(
    crossCaseRes.status === 404,
    `Tenant B blocked with HTTP 404 accessing Tenant A case 'c-1042' (got ${crossCaseRes.status})`,
  );

  // Tenant B cannot execute action on Tenant A's case (returns 404)
  const crossActionRes = await fetch(`${BASE_URL}/api/cases/c-1042/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tenant-ID": "omega-fin" },
    body: JSON.stringify({ type: "hold_payment", note: "Unauthorized cross-tenant action" }),
  });
  assert(
    crossActionRes.status === 404,
    `Tenant B blocked with HTTP 404 mutating Tenant A case (got ${crossActionRes.status})`,
  );

  // Tenant B cannot export report for Tenant A's case (returns 404)
  const crossReportRes = await fetch(`${BASE_URL}/api/cases/c-1042/report`, {
    headers: { "X-Tenant-ID": "omega-fin" },
  });
  assert(
    crossReportRes.status === 404,
    `Tenant B blocked with HTTP 404 accessing Tenant A forensic report (got ${crossReportRes.status})`,
  );

  // Tenant B cannot see Tenant A's vendors
  const tenantBVendorsRes = await fetch(`${BASE_URL}/api/vendors`, {
    headers: { "X-Tenant-ID": "omega-fin" },
  });
  const tenantBVendors = await tenantBVendorsRes.json();
  assert(tenantBVendorsRes.status === 200, "Tenant B GET /api/vendors returned HTTP 200");
  assert(
    Array.isArray(tenantBVendors) && tenantBVendors.length === 0,
    `Tenant B sees 0 vendors in their tenant space (got ${tenantBVendors.length})`,
  );

  // Tenant B cannot access Tenant A's vendor detail (returns 404)
  const crossVendorRes = await fetch(`${BASE_URL}/api/vendors/v-1`, {
    headers: { "X-Tenant-ID": "omega-fin" },
  });
  assert(
    crossVendorRes.status === 404,
    `Tenant B blocked with HTTP 404 accessing Tenant A vendor 'v-1' (got ${crossVendorRes.status})`,
  );

  // Tenant B cannot update Tenant A's vendor (returns 404)
  const crossVendorUpdateRes = await fetch(`${BASE_URL}/api/vendors/v-1`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Tenant-ID": "omega-fin" },
    body: JSON.stringify({ name: "Hacked Vendor" }),
  });
  assert(
    crossVendorUpdateRes.status === 404,
    `Tenant B blocked with HTTP 404 updating Tenant A vendor (got ${crossVendorUpdateRes.status})`,
  );

  // Tenant B cannot delete Tenant A's vendor (returns 404)
  const crossVendorDeleteRes = await fetch(`${BASE_URL}/api/vendors/v-1`, {
    method: "DELETE",
    headers: { "X-Tenant-ID": "omega-fin" },
  });
  assert(
    crossVendorDeleteRes.status === 404,
    `Tenant B blocked with HTTP 404 deleting Tenant A vendor (got ${crossVendorDeleteRes.status})`,
  );

  // Tenant B cannot see Tenant A's campaigns
  const tenantBCampaignsRes = await fetch(`${BASE_URL}/api/campaigns`, {
    headers: { "X-Tenant-ID": "omega-fin" },
  });
  const tenantBCampaigns = await tenantBCampaignsRes.json();
  assert(tenantBCampaignsRes.status === 200, "Tenant B GET /api/campaigns returned HTTP 200");
  assert(
    Array.isArray(tenantBCampaigns) && tenantBCampaigns.length === 0,
    `Tenant B sees 0 campaigns in their tenant space (got ${tenantBCampaigns.length})`,
  );

  console.log("\n10. Testing Anti-Downgrade & Payment Hold Policy Enforcement (/api/analyze)...");
  const testEmlContent = `From: billing@apex-logistics-fake.com
To: ap@sentinelcorp.com
Subject: Urgent: Updated Wire Instructions for Invoice #9821
Date: Mon, 07 Sep 2026 10:00:00 +0000
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Please note our bank details have changed.
Beneficiary: Apex Logistics LLC
New Bank Account: 1234567890123456
Please wire the outstanding payment of $45,000 immediately to the new account.
`;
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([testEmlContent], { type: "message/rfc822" }),
    "invoice_update.eml",
  );

  const analyzeRes = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminApiKey}`,
      "X-Tenant-ID": "sentinel-corp",
    },
    body: formData,
  });

  const analyzeData = await analyzeRes.json();
  const createdCase = analyzeData.case;
  assert(
    analyzeRes.status === 201,
    `POST /api/analyze returned HTTP 201 (got ${analyzeRes.status})`,
  );
  assert(
    createdCase && createdCase.threat_class === "invoice_fraud",
    `Threat class correctly identified as 'invoice_fraud' (got '${createdCase?.threat_class}')`,
  );
  assert(
    createdCase && createdCase.assigned_action === "Hold payment",
    `Assigned action correctly locked to 'Hold payment' (got '${createdCase?.assigned_action}')`,
  );
  assert(
    createdCase && createdCase.decision_banner.includes("Hold payment recommended"),
    `Decision banner enforces payment hold recommendation`,
  );

  console.log("\n==================================================================");
  console.log(`  📊 RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
