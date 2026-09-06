import asyncio
import unittest
from io import BytesIO

from case_builder import build_case
from case_repository import CaseRepository, repository
from eml_parser import parse_eml
from fastapi import HTTPException
from main import AnalystAction, analyze_email, get_case, get_case_report, list_cases, submit_case_action
from pydantic import ValidationError
from sender_identity import analyze_sender_identity
from starlette.datastructures import UploadFile


FRAUD_EML = b"""From: Accounts <billing@harborline-payments.example>
To: ap@example.com
Reply-To: payments@evil.example
Return-Path: <bounce@evil.example>
Subject: Updated invoice and payment instructions
Authentication-Results: mx.example; spf=fail; dkim=fail; dmarc=fail
Received: from relay.evil.example (relay.evil.example [203.0.113.50]); Tue, 1 Jan 2026 10:00:00 +0000
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="safe-boundary"

--safe-boundary
Content-Type: text/plain; charset=utf-8

Please update the beneficiary for invoice 8831. Bank account: 123456781284. USD 12,500.00
https://evil.example/payment
--safe-boundary
Content-Type: application/octet-stream; name="invoice.exe"
Content-Disposition: attachment; filename="invoice.exe"
Content-Transfer-Encoding: base64

TWFsaWNpb3VzIGJ5dGVzIGFyZSBuZXZlciBleGVjdXRlZA==
--safe-boundary--
"""


class ForensicTests(unittest.TestCase):
    def test_parser_extracts_safe_metadata_and_indicators(self):
        parsed = parse_eml(FRAUD_EML)
        self.assertEqual(parsed["authentication"], {"spf": "fail", "dkim": "fail", "dmarc": "fail"})
        self.assertEqual(parsed["financial"]["bank_account_last4"], "1284")
        self.assertEqual(parsed["financial"]["currency"], "USD")
        self.assertEqual(parsed["relay_ips"], ["203.0.113.50"])
        self.assertTrue(parsed["attachments"][0]["suspicious"])
        self.assertEqual(parsed["attachments"][0]["sha256"], "b64b49fc536085abacd3302b20dc526d52635087a4516791d04e22563613a468")

    def test_case_matches_frontend_forensic_shape(self):
        parsed = parse_eml(FRAUD_EML)
        case = build_case(parsed, "fraud.eml", "SM-1042")
        self.assertEqual(case["threat_class"], "malware_delivery")
        self.assertEqual(case["severity"], "critical")
        self.assertIn("technical", case["evidence"])
        self.assertIn("sender_identity", case["evidence"])
        self.assertGreater(case["risk_score"], 80)
        self.assertTrue(case["timeline"])
        identity = analyze_sender_identity(parsed)
        self.assertFalse(identity["aligned"]["reply_to"])

    def test_correlation_requires_two_distinct_indicator_types(self):
        repository = CaseRepository()
        repository.add({"id": "one", "case_number": "SM-1", "correlation_indicators": {"domain": ["evil.example"], "url": ["https://evil.example/payment"]}})
        self.assertIsNone(repository.correlate({"domain": ["evil.example"], "url": []}))
        result = repository.correlate({"domain": ["evil.example"], "url": ["https://evil.example/payment"]})
        self.assertEqual(result["matched_case_ids"], ["one"])

    def test_analyze_endpoint_handler_returns_frontend_contract(self):
        upload = UploadFile(BytesIO(b"From: a@example.com\nTo: b@example.com\nSubject: Hello\n\nNormal message"), filename="sample.eml")
        result = asyncio.run(analyze_email(upload))
        self.assertEqual(result["case_id"], result["case"]["id"])
        self.assertEqual(result["case"]["threat_class"], "benign")

    def test_cases_api_lifecycle_and_newest_first_summaries(self):
        older = build_case(parse_eml(FRAUD_EML), "older.eml", "SM-9001")
        newer = build_case(parse_eml(FRAUD_EML), "newer.eml", "SM-9002")
        older["created_at"] = "2099-01-01T00:00:00+00:00"
        newer["created_at"] = "2099-01-02T00:00:00+00:00"
        repository.add(older)
        repository.add(newer)

        summaries = list_cases()
        positions = {item["id"]: index for index, item in enumerate(summaries)}
        self.assertLess(positions[newer["id"]], positions[older["id"]])
        self.assertNotIn("correlation_indicators", get_case(newer["id"]))
        self.assertEqual(get_case(newer["id"])["id"], newer["id"])
        self.assertEqual(get_case("SM-9002")["id"], newer["id"])

    def test_analyst_action_updates_decision_and_action_history(self):
        case = build_case(parse_eml(FRAUD_EML), "action.eml", "SM-9003")
        repository.add(case)
        self.assertEqual(submit_case_action("SM-9003", AnalystAction(type="hold_payment", note="Synthetic test", analyst="Test analyst")), {"ok": True})
        updated = get_case(case["id"])
        self.assertEqual(updated["decision"], "payment_held")
        self.assertEqual(updated["actions"][0]["type"], "hold_payment")
        self.assertEqual(updated["actions"][0]["note"], "Synthetic test")
        self.assertEqual(updated["actions"][0]["analyst"], "Test analyst")

    def test_invalid_action_unknown_case_and_report(self):
        with self.assertRaises(ValidationError):
            AnalystAction(type="not_an_action")
        with self.assertRaises(HTTPException) as unknown:
            get_case("SM-does-not-exist")
        self.assertEqual(unknown.exception.status_code, 404)
        with self.assertRaises(HTTPException) as unknown_action:
            submit_case_action("SM-does-not-exist", AnalystAction(type="mark_safe"))
        self.assertEqual(unknown_action.exception.status_code, 404)

        case = build_case(parse_eml(FRAUD_EML), "report.eml", "SM-9004")
        repository.add(case)
        report = get_case_report("SM-9004").body.decode("utf-8")
        self.assertIn("SentinelMail Forensic Report", report)
        self.assertIn("Case: SM-9004", report)
        self.assertIn("Evidence Timeline", report)


if __name__ == "__main__":
    unittest.main()
