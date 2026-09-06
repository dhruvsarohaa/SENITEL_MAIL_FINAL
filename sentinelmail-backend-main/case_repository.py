"""Small process-local case store used only for real, same-process IOC correlation."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone


class CaseRepository:
    def __init__(self):
        self._cases: dict[str, dict] = {}

    def correlate(self, indicators: dict[str, list[str]]) -> dict | None:
        """Return a graph only when a prior case shares two distinct IOC types."""
        matches = []
        for case in self._cases.values():
            prior = case.get("correlation_indicators", {})
            shared = {
                kind: sorted(set(values).intersection(prior.get(kind, [])))
                for kind, values in indicators.items()
                if set(values).intersection(prior.get(kind, []))
            }
            if len(shared) >= 2:
                matches.append((case, shared))
        if not matches:
            return None

        matched_cases = [case for case, _ in matches]
        flattened = [(kind, value) for _, shared in matches for kind, values in shared.items() for value in values]
        nodes = [{"id": "case-current", "label": "Current email", "type": "email", "suspicious": True}]
        edges, seen = [], {"case-current"}
        for case in matched_cases:
            node_id = f"case-{case['case_number']}"
            if node_id not in seen:
                nodes.append({"id": node_id, "label": case["case_number"], "type": "email", "suspicious": True})
                seen.add(node_id)
        for kind, value in flattened:
            node_id = f"ioc-{kind}-{value}".replace("@", "_").replace(".", "_").replace(":", "_")
            if node_id not in seen:
                node_type = {"attachment_hash": "attachment", "bank_account": "bank_account"}.get(kind, kind)
                nodes.append({"id": node_id, "label": f"••••{value}" if kind == "bank_account" else value[:30], "type": node_type, "suspicious": True})
                seen.add(node_id)
            edges.append({"source": "case-current", "target": node_id, "suspicious": True})
            for case in matched_cases:
                edges.append({"source": f"case-{case['case_number']}", "target": node_id, "suspicious": True})
        return {"matched_case_ids": [case["id"] for case in matched_cases], "match_count": len(matches), "campaign_graph": {"nodes": nodes, "edges": edges}}

    def add(self, case: dict):
        self._cases[case["id"]] = deepcopy(case)

    def get(self, case_id_or_number: str) -> dict | None:
        """Find a case by its UUID or SentinelMail case number."""
        case = self._cases.get(case_id_or_number)
        if case is None:
            case = next((item for item in self._cases.values() if item.get("case_number") == case_id_or_number), None)
        return self._public_case(case) if case else None

    def list_summaries(self) -> list[dict]:
        """Return frontend CaseSummary objects, newest first."""
        summary_keys = ("id", "case_number", "subject", "sender", "threat_class", "risk_score", "severity", "decision", "assigned_action", "vendor", "amount_at_risk", "currency", "created_at")
        ordered = sorted(self._cases.values(), key=lambda item: item.get("created_at", ""), reverse=True)
        return [{key: deepcopy(case[key]) for key in summary_keys if key in case} for case in ordered]

    def record_action(self, case_id_or_number: str, action: dict) -> dict | None:
        """Append an analyst action and update its case decision in process-local storage."""
        case = self._cases.get(case_id_or_number)
        if case is None:
            case = next((item for item in self._cases.values() if item.get("case_number") == case_id_or_number), None)
        if case is None:
            return None
        decisions = {
            "mark_safe": "safe",
            "hold_payment": "payment_held",
            "escalate": "escalated",
            "confirm_threat": "confirmed_threat",
        }
        action_record = {
            "type": action["type"],
            **({"note": action["note"]} if action.get("note") else {}),
            **({"analyst": action["analyst"]} if action.get("analyst") else {}),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        case.setdefault("actions", []).append(action_record)
        case["decision"] = decisions[action["type"]]
        return self._public_case(case)

    @staticmethod
    def _public_case(case: dict) -> dict:
        """Prevent repository-only IOC state from leaking through the API."""
        public_case = deepcopy(case)
        public_case.pop("correlation_indicators", None)
        return public_case


repository = CaseRepository()
