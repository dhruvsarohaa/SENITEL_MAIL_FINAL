"""Explainable sender and authentication-header analysis."""

from email.utils import parseaddr


def get_domain(email_address):
    return email_address.rsplit("@", 1)[1].lower().strip("> ") if email_address and "@" in email_address else None


def analyze_sender_identity(email_data):
    """Analyze From/Reply-To/Return-Path alignment and SPF, DKIM, DMARC results."""
    _, from_email = parseaddr(email_data.get("from_header") or "")
    from_email = from_email.lower() or None
    reply_to, return_path = email_data.get("reply_to"), email_data.get("return_path")
    authentication = email_data.get("authentication") or {}
    from_domain, reply_to_domain, return_path_domain = get_domain(from_email), get_domain(reply_to), get_domain(return_path)
    findings, notes, risk_points = [], [], 0

    if reply_to:
        if reply_to_domain != from_domain:
            findings.append("Reply-To domain differs from From domain")
            notes.append({"label": "Reply-To differs from From", "detail": f"{reply_to_domain} ≠ {from_domain}", "severity": "critical", "weight": 0.20})
            risk_points += 20
    else:
        findings.append("No Reply-To header present")
    if return_path:
        if return_path_domain != from_domain:
            findings.append("Return-Path domain differs from From domain")
            notes.append({"label": "Return-Path differs from From", "detail": f"{return_path_domain} ≠ {from_domain}", "severity": "high", "weight": 0.12})
            risk_points += 12
    else:
        findings.append("No Return-Path header present")
    for method, weight in (("spf", 10), ("dkim", 10), ("dmarc", 10)):
        outcome = authentication.get(method, "none")
        if outcome in {"fail", "softfail"}:
            findings.append(f"{method.upper()} {outcome}ed" if outcome == "softfail" else f"{method.upper()} failed")
            notes.append({"label": f"{method.upper()} authentication {outcome}", "severity": "high", "weight": 0.10})
            risk_points += weight
    if not email_data.get("authentication_headers"):
        findings.append("No authentication results available")

    return {"from": from_email, "from_domain": from_domain, "reply_to": reply_to, "reply_to_domain": reply_to_domain,
            "return_path": return_path, "return_path_domain": return_path_domain, "authentication_results": email_data.get("authentication_results"),
            "auth": {"spf": authentication.get("spf", "none"), "dkim": authentication.get("dkim", "none"), "dmarc": authentication.get("dmarc", "none")},
            "risk_points": risk_points, "risk_level": "high" if risk_points >= 30 else "medium" if risk_points >= 20 else "low",
            "findings": findings, "notes": notes,
            "aligned": {"reply_to": reply_to_domain == from_domain if reply_to else None, "return_path": return_path_domain == from_domain if return_path else None}}
