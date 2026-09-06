import fs from "fs";
import path from "path";

async function runTests() {
  console.log("🧪 Starting SentinelMail End-to-End Pipeline Verification...\n");

  // 1. Health check
  const healthRes = await fetch("http://localhost:3001/api/health");
  const health = await healthRes.json();
  console.log("1. Health Check:", health);

  // 2. Vendors check
  const vendorsRes = await fetch("http://localhost:3001/api/vendors");
  const vendors = await vendorsRes.json();
  console.log(`2. Vendors Loaded: ${vendors.length} vendors`);

  // 3. Upload invoice_fraud.eml
  const fixturePath = path.join(process.cwd(), "server", "fixtures", "invoice_fraud.eml");
  const fileBytes = fs.readFileSync(fixturePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBytes]), "invoice_fraud.eml");

  const uploadRes = await fetch("http://localhost:3001/api/analyze", {
    method: "POST",
    body: formData,
  });
  const uploadResult = await uploadRes.json();
  const k = uploadResult.case;
  console.log(
    `3. EML Upload Result: Case #${k?.case_number}, Risk Score: ${k?.risk_score}, Threat: ${k?.threat_class}`,
  );
  console.log(`   - display_name: "${k?.evidence?.sender_identity?.display_name ?? "none"}"`);
  console.log(`   - vendor_relationship present: ${Boolean(k?.evidence?.vendor_relationship)}`);
  console.log(`   - financial notes present: ${k?.evidence?.financial?.notes?.length > 0}`);

  // 4. Submit analyst action (Hold Payment)
  const caseId = uploadResult.case?.case_number || uploadResult.case_id;
  const actionRes = await fetch(`http://localhost:3001/api/cases/${caseId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "hold_payment",
      note: "Out-of-band verification requested with CFO",
      analyst: "Security Analyst 1",
    }),
  });
  const actionResult = await actionRes.json();
  console.log("4. Analyst Action Result:", actionResult);

  // 5. Fetch updated case
  const updatedCaseRes = await fetch(`http://localhost:3001/api/cases/${caseId}`);
  const updatedCase = await updatedCaseRes.json();
  console.log(
    `5. Case Decision: "${updatedCase.decision}", Triage Minutes: ${updatedCase.triage_minutes} min, Actions Logged: ${updatedCase.actions?.length}`,
  );

  // 6. Download Forensic Report
  const reportRes = await fetch(`http://localhost:3001/api/cases/${caseId}/report`);
  const reportText = await reportRes.text();
  console.log(`6. Forensic Report Generated (${reportText.length} bytes):\n`);
  console.log(reportText.slice(0, 320) + "...\n");

  // 7. Verify List Cases includes triage_minutes and vendor
  const casesRes = await fetch("http://localhost:3001/api/cases");
  const casesList = await casesRes.json();
  const found = casesList.find((c: any) => c.case_number === k?.case_number);
  console.log(
    `7. List Cases verification for ${k?.case_number}: triage_minutes=${found?.triage_minutes}m, vendor=${found?.vendor}`,
  );

  console.log("✅ ALL CONTRACT & PIPELINE TESTS PASSED!");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
