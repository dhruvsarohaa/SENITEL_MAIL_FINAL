"""Safe, metadata-only forensic extraction for RFC 822 / .eml messages."""

from email import policy
from email.parser import BytesParser
from email.message import Message
from email.utils import getaddresses
from urllib.parse import urlparse
import re
import hashlib


MAX_MESSAGE_BYTES = 25 * 1024 * 1024
URL_PATTERN = re.compile(r'https?://[^\s<>"\'\])]+', re.IGNORECASE)
DANGEROUS_EXTENSIONS = {".exe", ".js", ".jse", ".vbs", ".vbe", ".bat", ".cmd", ".scr", ".ps1", ".iso", ".img", ".lnk"}
DANGEROUS_MIME_MARKERS = ("x-msdownload", "javascript", "x-sh")


def _unique(values):
    return list(dict.fromkeys(value for value in values if value))


def _address(value):
    addresses = getaddresses([value or ""])
    return addresses[0][1].lower() if addresses and addresses[0][1] else None


def _domain(address):
    return address.rsplit("@", 1)[1].lower().strip("> ") if address and "@" in address else None


def extract_body(message: Message) -> str:
    """Extract decoded readable text without processing attachment payloads."""
    plain_parts, html_parts = [], []
    for part in message.walk() if message.is_multipart() else [message]:
        if part.is_multipart() or part.get_content_disposition() == "attachment":
            continue
        content_type = part.get_content_type()
        if content_type not in {"text/plain", "text/html"}:
            continue
        try:
            content = part.get_content()
            if not isinstance(content, str):
                continue
            (plain_parts if content_type == "text/plain" else html_parts).append(
                content if content_type == "text/plain" else re.sub(r"<[^>]+>", " ", content)
            )
        except Exception:
            continue
    return "\n".join(plain_parts or html_parts).strip()


def extract_urls(text: str):
    return _unique([match.rstrip(".,;:") for match in URL_PATTERN.findall(text)])


def extract_attachments(message: Message):
    """Return metadata and hashes only. Attachments are never opened or executed."""
    attachments = []
    for part in message.walk():
        filename, disposition = part.get_filename(), part.get_content_disposition()
        if not filename and disposition != "attachment":
            continue
        safe_name, content_type = filename or "unnamed-attachment", part.get_content_type().lower()
        try:
            payload = part.get_payload(decode=True) or b""
            sha256 = hashlib.sha256(payload).hexdigest()
        except Exception:
            payload, sha256 = b"", None
        suspicious = any(safe_name.lower().endswith(ext) for ext in DANGEROUS_EXTENSIONS) or any(marker in content_type for marker in DANGEROUS_MIME_MARKERS)
        attachments.append({"filename": safe_name, "content_type": content_type, "mime_type": content_type,
                            "size": len(payload), "size_bytes": len(payload), "sha256": sha256, "suspicious": suspicious})
    return attachments


def parse_authentication_results(values):
    combined, results = " ".join(values), {}
    allowed = {"spf": {"pass", "fail", "softfail", "neutral", "none"}, "dkim": {"pass", "fail", "none"}, "dmarc": {"pass", "fail", "none"}}
    for method, permitted in allowed.items():
        match = re.search(rf"\b{method}=(pass|fail|softfail|neutral|none)\b", combined, re.I)
        result = match.group(1).lower() if match else "none"
        results[method] = result if result in permitted else "none"
    return results


def extract_relay_hops(message: Message):
    hops = []
    for index, received in enumerate(message.get_all("Received", [])[:8], start=1):
        host = re.search(r"\bfrom\s+([^\s(]+)", received, re.I)
        ip = re.search(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", received)
        timestamp = received.rsplit(";", 1)[-1].strip() if ";" in received else None
        hops.append({"index": index, "host": host.group(1) if host else "Unspecified relay", "ip": ip.group(0) if ip else "—", **({"timestamp": timestamp} if timestamp else {})})
    return hops


def extract_financial_indicators(text: str):
    payment_change = bool(re.search(r"\b(update(?:d)?|new|amended|change(?:d)?).{0,50}\b(bank|account|beneficiary|payment|remittance)|\b(bank|account|beneficiary).{0,50}\b(update(?:d)?|new|amended|change(?:d)?)", text, re.I | re.S))
    match = re.search(r"\b(?:iban|bank account|account(?: number)?|acct)\s*(?:no\.?|number)?\s*(?::|#|-|\s+)\s*([A-Z]{2}\d[A-Z0-9 -]{6,32}|\d[\d -]{5,34})\b", text, re.I)
    account = re.sub(r"[^A-Z0-9]", "", match.group(1).upper()) if match else ""
    amount_match = re.search(r"(?:\b(USD|EUR|GBP|INR)\b|([$€£₹]))\s?([\d,]+(?:\.\d{2})?)", text, re.I)
    symbols = {"$": "USD", "€": "EUR", "£": "GBP", "₹": "INR"}
    currency = (amount_match.group(1) or symbols.get(amount_match.group(2) or "", "USD")).upper() if amount_match else None
    beneficiary = re.search(r"\bbeneficiary\s*[:\-]\s*([^\r\n.]{2,80})", text, re.I)
    return {"payment_change_requested": payment_change, "bank_account_last4": account[-4:] if len(account) >= 4 else None,
            "beneficiary": beneficiary.group(1).strip() if beneficiary else None,
            "invoice_amount": float(amount_match.group(3).replace(",", "")) if amount_match else None, "currency": currency}


def parse_eml(content: bytes) -> dict:
    """Parse an EML into safe forensic metadata; malformed content raises ValueError."""
    if not content:
        raise ValueError("The uploaded .eml file is empty.")
    if len(content) > MAX_MESSAGE_BYTES:
        raise ValueError("The uploaded .eml file exceeds the 25 MB limit.")
    message = BytesParser(policy=policy.default).parsebytes(content)
    body, auth_headers = extract_body(message), message.get_all("Authentication-Results", [])
    sender = _address(message.get("From"))
    reply_to, return_path = _address(message.get("Reply-To")), _address(message.get("Return-Path"))
    urls, relay_path = extract_urls(body), extract_relay_hops(message)
    recipients = [address.lower() for _, address in getaddresses(message.get_all("To", []) + message.get_all("Cc", [])) if address]
    domains = _unique([_domain(sender) or "", _domain(reply_to) or "", _domain(return_path) or "", *[(urlparse(url).hostname or "").lower() for url in urls]])
    return {"sender": sender, "from_header": message.get("From"), "to": _unique(recipients), "reply_to": reply_to,
            "return_path": return_path, "subject": message.get("Subject"), "date": message.get("Date"), "message_id": message.get("Message-ID"),
            "authentication_results": auth_headers[0] if auth_headers else None, "authentication_headers": auth_headers,
            "authentication": parse_authentication_results(auth_headers), "body": body, "urls": urls, "domains": domains,
            "attachments": extract_attachments(message), "relay_path": relay_path, "relay_ips": [hop["ip"] for hop in relay_path if hop["ip"] != "—"],
            "financial": extract_financial_indicators(body), "headers": {key: value for key, value in message.items()}}
