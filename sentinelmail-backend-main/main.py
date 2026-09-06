from itertools import count
from typing import Literal

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from case_builder import build_case
from case_repository import repository
from eml_parser import parse_eml


app = FastAPI(title="SentinelMail API")
case_numbers = count(1042)


class AnalystAction(BaseModel):
    type: Literal["mark_safe", "hold_payment", "escalate", "confirm_threat"]
    note: str | None = None
    analyst: str | None = None


@app.get("/")
def home():
    return {
        "message": "SentinelMail API is running!"
    }


@app.post("/api/analyze")
async def analyze_email(file: UploadFile = File(...)):

    if not file.filename or not file.filename.lower().endswith(".eml"):
        raise HTTPException(
            status_code=400,
            detail="Only .eml files are supported"
        )

    content = await file.read()

    try:
        parsed_email = parse_eml(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    indicators = {
        "domain": parsed_email["domains"],
        "url": parsed_email["urls"],
        "reply_to": [parsed_email["reply_to"]] if parsed_email["reply_to"] else [],
        "bank_account": [parsed_email["financial"]["bank_account_last4"]] if parsed_email["financial"]["bank_account_last4"] else [],
        "attachment_hash": [item["sha256"] for item in parsed_email["attachments"] if item.get("sha256")],
        "ip": parsed_email["relay_ips"],
    }
    correlation = repository.correlate(indicators)
    case = build_case(parsed_email, file.filename, f"SM-{next(case_numbers)}", correlation)
    repository.add(case)
    return {"case_id": case["id"], "case": case}


@app.get("/api/cases")
def list_cases():
    """List analyzed case summaries, newest first."""
    return repository.list_summaries()


def _case_or_404(case_id: str) -> dict:
    case = repository.get(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found.")
    return case


@app.get("/api/cases/{case_id}/report", response_class=PlainTextResponse)
def get_case_report(case_id: str):
    """Return the same plain-text forensic report format as the reference backend."""
    case = _case_or_404(case_id)
    timeline = case.get("timeline", [])
    report = [
        "SentinelMail Forensic Report",
        "═" * 40,
        f"Case: {case['case_number']}",
        f"Subject: {case['subject']}",
        f"Sender: {case['sender']}",
        f"Risk: {case['risk_score']}/100 ({case['severity']})",
        f"Classification: {case['threat_class']}",
        f"Confidence: {case['confidence'] * 100:.0f}%",
        f"Decision: {case['decision']}",
        "",
        case["decision_banner"],
        "",
        "Evidence Timeline",
        "─" * 30,
        *[f"• {entry['title']}: {entry['description']}" for entry in timeline],
    ]
    return PlainTextResponse("\n".join(report))


@app.post("/api/cases/{case_id}/action")
def submit_case_action(case_id: str, action: AnalystAction):
    """Record an analyst action and update the case decision."""
    updated_case = repository.record_action(case_id, action.model_dump())
    if updated_case is None:
        raise HTTPException(status_code=404, detail="Case not found.")
    return {"ok": True}


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    """Retrieve a full case by UUID or SentinelMail case number."""
    return _case_or_404(case_id)
