"""
SentinelMail Enterprise Mailbox Poller & Ingestion Engine (Python)
-----------------------------------------------------------------
Continuous synchronization service that ingests messages from corporate mailboxes
(Microsoft Graph API / Gmail API) or local quarantine spools and submits them
to the SentinelMail automated analysis & containment pipeline.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

DEFAULT_API_URL = os.getenv("SENTINEL_API_URL", "http://localhost:3001")
DEFAULT_API_KEY = os.getenv("SENTINEL_API_KEY", "sm_live_default_sentinel_corp_key_12345")
DEFAULT_TENANT = os.getenv("SENTINEL_TENANT_ID", "sentinel-corp")


class SentinelIngestionClient:
    def __init__(self, base_url: str = DEFAULT_API_URL, api_key: str = DEFAULT_API_KEY, tenant: str = DEFAULT_TENANT):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.tenant = tenant

    def submit_eml(self, eml_bytes: bytes, filename: str = "incoming.eml") -> dict:
        """Submit a raw RFC-822 .eml payload to the ingestion webhook."""
        url = f"{self.base_url}/api/ingest/m365/webhook"
        payload = json.dumps({
            "raw_eml": eml_bytes.decode("utf-8", errors="replace"),
            "filename": filename
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "X-Tenant-ID": self.tenant,
                "User-Agent": "SentinelMail-Python-Ingest/1.0"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                res_body = response.read().decode("utf-8")
                return json.loads(res_body)
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", errors="replace")
            return {"status": "error", "code": e.code, "message": err_msg}
        except Exception as ex:
            return {"status": "error", "message": str(ex)}

    def sync_spool_directory(self, spool_dir: str) -> dict:
        """Scan a directory of incoming .eml files and process them sequentially."""
        p = Path(spool_dir)
        if not p.exists() or not p.is_dir():
            return {"processed": 0, "error": f"Directory {spool_dir} does not exist"}

        eml_files = list(p.glob("*.eml"))
        results = []

        print(f"[*] SentinelMail Ingestion: Found {len(eml_files)} message(s) in {spool_dir}")
        for filepath in eml_files:
            try:
                with open(filepath, "rb") as f:
                    raw_bytes = f.read()

                print(f"    --> Processing {filepath.name} ({len(raw_bytes)} bytes)...")
                res = self.submit_eml(raw_bytes, filename=filepath.name)
                case_info = res.get("case", {})
                risk = case_info.get("risk_score", "N/A")
                decision = case_info.get("decision", "pending")
                print(f"        [OK] Ingested Case: {case_info.get('case_number', 'N/A')} | Risk: {risk}/100 | Decision: {decision}")
                results.append({"file": filepath.name, "result": res})
            except Exception as e:
                print(f"        [ERR] Failed to process {filepath.name}: {e}")

        return {"processed": len(results), "details": results}


def main():
    print("==================================================================")
    print("  SentinelMail Enterprise Python Mailbox Ingestion Worker")
    print("==================================================================")

    client = SentinelIngestionClient()
    
    # Check if a directory path is passed as command line argument
    if len(sys.argv) > 1:
        target_dir = sys.argv[1]
        client.sync_spool_directory(target_dir)
    else:
        # Default scan against test fixtures directory
        fixtures_dir = Path(__file__).resolve().parent.parent / "server" / "fixtures"
        if fixtures_dir.exists():
            print(f"[*] Scanning default fixtures spool: {fixtures_dir}")
            client.sync_spool_directory(str(fixtures_dir))
        else:
            print("[i] Ready. Specify an .eml directory to poll: python mailbox_poller.py <path_to_spool>")


if __name__ == "__main__":
    main()
