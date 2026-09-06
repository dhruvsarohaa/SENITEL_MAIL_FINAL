"""Build SentinelMail frontend-compatible forensic Case payloads."""

from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse
from uuid import uuid4

from sender_identity import analyze_sender_identity


def _classify(text, attachments):
    value = text.lower()
    if any(item.get("suspicious") for item in attachments):
        return "malware_delivery"
    if any(term in value for term in ("password", "sign in", "login", "verify your account", "mailbox quota", "mailbox full")):
        return "credential_phishing"
    if (("ceo" in value or "board" in value) and any(term in value for term in ("wire", "transfer", "payment"))) or ("confidential" in value and "transfer" in value):
        return "ceo_impersonation"
    if any(term in value for term in ("invoice", "remittance", "beneficiary", "bank details", "payment instructions")) and any(term in value for term in ("change", "updated", "new", "wire", "transfer", "payment")):
        return "invoice_fraud"
    return "benign"


def _severity(score):
    return "critical" if score >= 80 else "high" if score >= 60 else "medium" if score >= 35 else "low" if score else "safe"


def _signal(label, severity, weight, detail=None):
    signal = {"label": label, "severity": severity, "weight": weight}
    if detail:
        signal["detail"] = detail
    return signal


def build_case(parsed, filename, case_number, correlation=None):
    """Create an explainable case without vendor baselines or external services."""
    identity = analyze_sender_identity(parsed)
    financial = parsed["financial"]
    threat_class = _classify(f"{parsed.get('subject') or ''}\n{parsed['body']}", parsed["attachments"])
    signals, score = [], 0 if threat_class == "benign" else 18
    if threat_class != "benign":
        signals.append(_signal(f"Message intent: {threat_class.replace('_', ' ')}", "high", 0.18))
    if financial["payment_change_requested"]:
        score += 28; signals.append(_signal("Payment or beneficiary change requested", "critical", 0.28))
    if financial["bank_account_last4"]:
        score += 16; signals.append(_signal(f"Bank account detected ending {financial['bank_account_last4']}", "high", 0.16))
        if financial["payment_change_requested"]:
            signals.append(_signal("Bank details require vendor-baseline verification", "high", 0.12, "No vendor baseline is configured, so this account cannot be marked known or unknown."))
    if any(item.get("suspicious") for item in parsed["attachments"]):
        score += 30; signals.append(_signal("Executable or script attachment detected", "critical", 0.30))
    score += identity["risk_points"]
    signals.extend(identity["notes"])
    if correlation:
        score += 12
        signals.append(_signal("Shared indicators found in prior analyzed cases", "high", 0.12, f"{correlation['match_count']} matching case(s)"))
    score = min(99, score)
    severity = _severity(score)
    confidence = max(0.35, min(0.98, 0.5 + score / 200))
    hold_payment = threat_class == "invoice_fraud" and (financial["payment_change_requested"] or bool(financial["bank_account_last4"]))
    timeline = [{"order": index, "title": signal["label"], "description": signal.get("detail", "Extracted from the uploaded email."), "severity": signal["severity"], "weight": signal["weight"]} for index, signal in enumerate(signals, start=1)]
    now = datetime.now(timezone.utc).isoformat()
    suspicious_urls = [url for url in parsed["urls"] if (urlparse(url).hostname or "").startswith("xn--") or "@" in urlparse(url).netloc or any(term in url.lower() for term in ("login", "verify", "password"))]
    suspicious_domains = list(dict.fromkeys((urlparse(url).hostname or "").lower() for url in suspicious_urls))
    case = {"id": str(uuid4()), "case_number": case_number, "subject": parsed.get("subject") or filename,
            "sender": parsed.get("sender") or parsed.get("from_header") or "Unknown sender", "threat_class": threat_class,
            "risk_score": score, "severity": severity, "confidence": confidence, "decision": "pending",
            "assigned_action": "Hold payment" if hold_payment else "Review required",
            "decision_banner": "Hold payment recommended — payment-change evidence requires out-of-band verification" if hold_payment else ("No high-risk indicators found in the uploaded email" if severity == "safe" else "Review required — investigate the evidence before acting"),
            "vendor": "—", "recipients": parsed["to"], "body_preview": parsed["body"][:12000], "created_at": now,
            "evidence": {"intent": {"classification": threat_class, "model_confidence": confidence, "signals": signals},
                         "sender_identity": {"from_address": identity["from"] or "Unknown sender", "auth": identity["auth"], "authentication_headers": parsed["authentication_headers"], "notes": identity["notes"],
                                             **({"reply_to": identity["reply_to"]} if identity["reply_to"] else {}), **({"return_path": identity["return_path"]} if identity["return_path"] else {})},
                         "financial": {key: value for key, value in financial.items() if value is not None},
                         "technical": {"urls": parsed["urls"], "domains": parsed["domains"], "suspicious_urls": suspicious_urls, "suspicious_domains": suspicious_domains, "relay_ips": parsed["relay_ips"], "attachments": parsed["attachments"]}},
            "timeline": timeline, "relay_path": parsed["relay_path"], "actions": [],
            "correlation_indicators": {"domain": parsed["domains"], "url": parsed["urls"], "reply_to": [identity["reply_to"]] if identity["reply_to"] else [], "bank_account": [financial["bank_account_last4"]] if financial["bank_account_last4"] else [], "attachment_hash": [item["sha256"] for item in parsed["attachments"] if item.get("sha256")], "ip": parsed["relay_ips"]}}
    if financial["invoice_amount"] is not None:
        case["amount_at_risk"], case["currency"] = financial["invoice_amount"], financial["currency"] or "USD"
    if correlation:
        case["campaign_graph"] = correlation["campaign_graph"]
    return case
