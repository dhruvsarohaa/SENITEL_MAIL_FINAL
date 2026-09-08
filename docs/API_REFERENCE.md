# SentinelMail API Reference

Comprehensive technical reference for the SentinelMail REST API, backend route architecture, enterprise multi-tenancy layer, and frontend client integration.

---

## Architecture & Overview

The SentinelMail backend is an Express.js service ([`server/index.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts)) operating on port `3001` (or `PORT` / `API_PORT` from environment configuration). It coordinates multi-tenant isolation, mailbox webhook ingestion, AI-driven behavioral analysis, multi-layered threat scoring, automated containment dispatch, and forensic PDF report generation.

```
Inbound Email (.eml / Webhook)
           │
           ▼
  ┌───────────────────────────────────────────────────────────┐
  │  Authentication & Multi-Tenant Layer (tenantAuthMiddleware)│
  │  Bearer Firebase ID Token OR Bearer sm_live_... API Key   │
  └───────────────────────────────────────────────────────────┘
           │
           ▼
  ┌───────────────────────────────────────────────────────────┐
  │  Forensic Pipeline                                        │
  │  1. MIME & Header Parsing (eml-parser.ts)                 │
  │  2. AI Intent Classification (classifier.ts: Gemini/GPT)  │
  │  3. Vendor Behavioral Comparison (behavioral.ts)          │
  │  4. Score Fusion Engine (scoring.ts)                      │
  │  5. Threat Campaign Correlation (campaign.ts)             │
  └───────────────────────────────────────────────────────────┘
           │
           ├──► PostgreSQL / MongoDB Storage
           ├──► Containment Alerts (Slack / Teams / Webhook / SMTP)
           └──► Forensic PDF Report Generator (pdf-report.ts)
```

---

## Authentication & Authorization

All API endpoints under `/api` (with the exception of `/api/health`) require authentication via the [`tenantAuthMiddleware`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/middleware/auth.js#L15-L134). Requests must supply an `Authorization` header formatted as:

```http
Authorization: Bearer <TOKEN>
```

### Supported Token Formats

1. **Enterprise API Keys (`sm_live_...`)**:
   - Cryptographically random 24-byte tokens prefixed with `sm_live_` generated via `POST /api/tenants/api-keys`.
   - Stored hashed using SHA-256 (`server/services/tenant.js`).
   - Resolves tenant context (`req.tenant = { id, name, slug }`) and synthetic user credentials (`req.user = { id: "apikey-<keyId>", role, name }`).
2. **Firebase ID Tokens**:
   - Decoded and cryptographically verified using `firebaseAuth.verifyIdToken()` via the Firebase Admin SDK ([`server/services/firebase-admin.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/firebase-admin.js)).
   - Resolves against the internal PostgreSQL `users` table joined to `organizations` via email lookup.
   - Binds authenticated state:
     - `req.user = { id, firebaseUid, email, name, role }`
     - `req.tenant = { id, name, slug, plan }`

### Role-Based Access Control (RBAC)

Endpoints utilize the [`requireRole(allowedRoles)`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/middleware/auth.js#L141-L162) middleware generator:

| Role               | Permissions                                                                                                                        |
| :----------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| `admin`            | Superuser privileges. Can manage API keys, provision organizations, register mailbox connectors, and perform all analyst actions.  |
| `analyst`          | Can upload/analyze emails, inspect cases, record triage decisions (`hold_payment`, `mark_safe`, etc.), and manage vendor profiles. |
| `finance_approver` | View case forensics, audit financial exposure, and approve/release payments.                                                       |
| `auditor`          | Read-only inspection of cases, campaigns, and organization user rosters.                                                           |

Unauthenticated requests return `HTTP 401 Unauthorized`. Requests failing RBAC checks return `HTTP 403 Forbidden`.

---

## Frontend Client & Demo Mode Architecture

The frontend communicates with the backend via the typed singleton `api` exported in [`src/lib/api.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/api.ts).

### The `Sourced<T>` Wrapper

Read-only dataset endpoints wrap their payload inside a `Sourced<T>` container:

```typescript
export interface Sourced<T> {
  data: T;
  demo: boolean;
}
```

This interface enables the UI to transparently detect and label whether the current view reflects live server telemetry (`demo: false`) or fallback demo fixtures (`demo: true`).

### Request Lifecycle & Timeout

All live calls go through `request<T>(path, init)`:

- Automatically attaches Firebase JWT: `Authorization: Bearer <token>` when `firebaseAuth.currentUser` is present.
- Sets default header `Accept: application/json`.
- Enforces an `AbortController` timeout of **30,000 ms** (30 seconds). If exceeded, raises an `ApiError` with HTTP status `408`.

### Demo Mode Behavior (`VITE_DEMO_MODE=true`)

When `VITE_DEMO_MODE=true` is set in the environment:

1. **Network Bypass**: API calls bypass backend network transport entirely and run against local fixture state ([`src/lib/demo-data.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/demo-data.ts)).
2. **Analysis Simulation**: `api.analyze()` simulates a 2,400 ms processing latency, parses the filename and initial 4 KB of text, and matches relevant fixtures (e.g., matching "supply" or "invoice-fraud" to case `c-1042`, "harborline" to `c-1037`, "ceo" to `c-1041`, "m365" or "credential" to `c-1035`, "malware" to `c-1031`, or "benign" to `c-1028`).
3. **Report Format**: Live mode requests `GET /api/cases/:caseId/report` with `Accept: application/pdf` to receive a binary PDF generated by PDFKit. In demo mode, `api.downloadReport()` generates an in-browser plain-text report (`text/plain`, `.txt` extension) detailing containment steps and behavioral baselines.
4. **Mutations**: `api.submitAction()` delays 500 ms and returns `{ ok: true }` without altering backend state.

---

## API Endpoints

### 1. Upload & Analyze Email

**`POST /api/analyze`** ([`server/routes/analyze.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/analyze.ts#L38-L335))

Executes the full forensic evaluation pipeline on an uploaded RFC 822 `.eml` file.

#### Security & Rate Limiting

- **Authentication**: Required (`Bearer <token>`)
- **Rate Limit**: 10 uploads per minute per client IP (`HTTP 429` on exceed)
- **Max File Size**: 25 MB (`multipart/form-data`)

#### Request

- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `file`: (File, Required) The raw `.eml` email file. Original filename must end with `.eml`.
  - `vendor_id`: (string, Optional) Explicit vendor profile ID to correlate against.

#### Execution Pipeline

1. **MIME Parsing & Extraction** ([`server/services/eml-parser.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/eml-parser.ts)): Parses headers, extracted relay hops, SPF/DKIM/DMARC auth results, body text, attachments, URLs, domains, and banking indicators (IBAN, account suffixes, wire instructions).
2. **Vendor Identification**: Matches against known vendor profiles by `vendor_id`, exact sender domain, or domain stem.
3. **AI Intent Classification** ([`server/services/classifier.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/classifier.ts)): Evaluates message intent using Google Gemini 2.5 Flash (`GEMINI_API_KEY`) or OpenAI GPT-4o-mini (`OPENAI_API_KEY`), falling back to deterministic heuristic rules.
4. **Behavioral Contrast Engine** ([`server/services/behavioral.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/behavioral.ts)): Contrasts sender address, Reply-To mismatch, recipients, bank accounts, and invoice timing against historical vendor baselines.
5. **Score Fusion** ([`server/services/scoring.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/scoring.ts)): Combines rule-based severity, behavioral score deltas, and AI model confidence into a single unified risk score (0–100) and severity bracket (`critical`, `high`, `medium`, `low`, `safe`).
6. **Case Persistence**: Allocates case sequence number (`SM-<seq>`), calculates SHA-256 hash of raw EML bytes, and persists case record to database scoped to `req.tenant.id`.
7. **Campaign Clustering** ([`server/services/campaign.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/campaign.ts)): Matches technical indicators (URLs, domains, attachment hashes, relay IPs, bank accounts) to cluster with existing campaigns.

#### Response (`HTTP 201 Created`)

```json
{
  "case_id": "c-9a4f210e-8f2a-4c28-98e3-0d5b78b01234",
  "case": {
    "id": "c-9a4f210e-8f2a-4c28-98e3-0d5b78b01234",
    "case_number": "SM-1048",
    "subject": "URGENT: Updated Remittance Instructions for Invoice #88213",
    "sender": "ap-billing@harborline-logistics.com",
    "recipients": ["treasury@astermanufacturing.com"],
    "threat_class": "invoice_fraud",
    "risk_score": 92,
    "severity": "critical",
    "confidence": 0.94,
    "decision": "pending",
    "assigned_action": "Hold payment",
    "decision_banner": "Hold payment recommended — payment-change evidence requires out-of-band verification",
    "vendor": "Harborline Freight & Logistics",
    "amount_at_risk": 48500,
    "currency": "USD",
    "body_preview": "Please note our banking depository details have changed...",
    "evidence": {
      "intent": {
        "classification": "invoice_fraud",
        "model_confidence": 0.94,
        "signals": [
          {
            "label": "Google Gemini 2.5 Flash Intent Analysis: invoice fraud",
            "detail": "Urgent request to redirect accounts payable funds to a new bank account.",
            "severity": "critical",
            "weight": 0.35
          }
        ]
      },
      "sender_identity": {
        "from_address": "ap-billing@harborline-logistics.com",
        "reply_to": "accounting@harbor1ine-logistics.com",
        "auth": { "spf": "pass", "dkim": "pass", "dmarc": "pass" },
        "trusted_vendor": "Harborline Freight & Logistics",
        "vendor_domain_match": false
      },
      "financial": {
        "invoice_amount": 48500,
        "currency": "USD",
        "bank_account_last4": "8841",
        "bank_account_known": false,
        "payment_change_requested": true
      },
      "technical": {
        "urls": ["https://harbor1ine-logistics.com/portal/invoice88213.pdf"],
        "domains": ["harbor1ine-logistics.com"],
        "relay_ips": ["198.51.100.44"],
        "attachments": [
          {
            "filename": "Updated_Remittance_88213.pdf",
            "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "suspicious": true
          }
        ]
      }
    },
    "timeline": [
      {
        "order": 1,
        "title": "Off-Domain Reply-To Detected",
        "description": "Reply-To address 'accounting@harbor1ine-logistics.com' uses lookalike domain with character substitution.",
        "severity": "critical",
        "weight": 0.35
      }
    ],
    "created_at": "2026-09-07T04:25:00.000Z"
  }
}
```

---

### 2. List Case Summaries

**`GET /api/cases`** ([`server/routes/cases.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/cases.ts#L10-L48))

Retrieves an array of lightweight case summaries for the dashboard and incident queue, ordered by creation date descending.

#### Security

- **Authentication**: Required (`Bearer <token>`)
- **Tenant Isolation**: Filtered automatically by `req.tenant.id`.

#### Response (`HTTP 200 OK`)

```json
[
  {
    "id": "c-9a4f210e-8f2a-4c28-98e3-0d5b78b01234",
    "case_number": "SM-1048",
    "subject": "URGENT: Updated Remittance Instructions for Invoice #88213",
    "sender": "ap-billing@harborline-logistics.com",
    "threat_class": "invoice_fraud",
    "risk_score": 92,
    "severity": "critical",
    "decision": "pending",
    "assigned_action": "Hold payment",
    "vendor": "Harborline Freight & Logistics",
    "amount_at_risk": 48500,
    "currency": "USD",
    "triage_minutes": 4,
    "created_at": "2026-09-07T04:25:00.000Z"
  }
]
```

---

### 3. Get Full Case Detail

**`GET /api/cases/:caseId`** ([`server/routes/cases.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/cases.ts#L51-L118))

Fetches complete forensic telemetry, evidence breakdown, raw email relay path, and analyst decision history for a specific case.

#### Parameters

- `caseId`: (Path parameter, Required) Case UUID or human-readable case number (e.g. `SM-1048`).

#### Response (`HTTP 200 OK`)

Returns the complete [`Case`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/types.ts#L131-L144) object containing:

- All summary attributes
- `evidence`: Detailed intent, sender identity, authentication (SPF/DKIM/DMARC), financial, technical, and vendor relationship signals
- `timeline`: Chronological progression of forensic indicators
- `relay_path`: Detailed MTA hop analysis (IP, ASN, hostname, timestamp)
- `campaign_id` & `campaign_graph`: Threat cluster node/edge graph if correlated
- `actions`: Recorded analyst remediation actions

#### Error Responses

- `HTTP 404 Not Found`: Case does not exist or belongs to another organization.

---

### 4. Submit Analyst Remediation Action

**`POST /api/cases/:caseId/action`** ([`server/routes/cases.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/cases.ts#L121-L181))

Submits an analyst investigation decision, updates case status, logs audit records, and triggers automated containment alerts.

#### Parameters

- `caseId`: (Path parameter, Required) Case UUID or case number.

#### Request Body

```json
{
  "type": "hold_payment",
  "note": "Called verified CFO contact out-of-band; bank account change confirmed fraudulent.",
  "analyst": "Alex Mercer (SecOps Tier 2)"
}
```

#### Action Types & State Mapping

| Action `type`    | Resulting Case `decision` | Automated Containment Dispatch                         |
| :--------------- | :------------------------ | :----------------------------------------------------- |
| `hold_payment`   | `payment_held`            | Yes (Emergency hold alert to webhook/Slack/Teams/SMTP) |
| `escalate`       | `escalated`               | Yes (Incident escalation notification)                 |
| `mark_safe`      | `safe`                    | No                                                     |
| `confirm_threat` | `confirmed_threat`        | No                                                     |

#### Containment Integration

When `hold_payment` or `escalate` is submitted, [`sendContainmentAlert()`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/containment.ts) automatically fires outbound webhooks, Slack incoming webhooks (`SLACK_WEBHOOK_URL`), Microsoft Teams webhooks (`TEAMS_WEBHOOK_URL`), and security desk emails (`SMTP_HOST`).

#### Response (`HTTP 200 OK`)

```json
{
  "ok": true
}
```

---

### 5. Generate Forensic PDF Report

**`GET /api/cases/:caseId/report`** ([`server/routes/cases.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/cases.ts#L184-L240))

Generates an audit-grade multi-page forensic incident PDF report using PDFKit ([`server/services/pdf-report.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/pdf-report.ts)).

#### Request Headers

- `Accept`: `application/pdf` (Default). To explicitly request plaintext fallback, pass `Accept: text/plain`.

#### PDF Report Contents

- **Executive Summary Header**: Case reference ID, timestamp, classification, and risk severity score badge.
- **Critical AP Containment Protocol**: Step-by-step containment instructions (ERP payment voucher freeze, verified telephone callback verification, depository blocklist addition).
- **Sender Identity & Authentication**: SPF, DKIM, and DMARC status, Reply-To discrepancies, and MTA relay route hops.
- **Behavioral Baseline Contrast**: Known vendor normal baseline vs. inbound anomalies (depository changes, off-domain redirects).
- **Forensic Evidence & Indicators**: Extracted phishing URLs, suspicious attachments with SHA-256 hashes, and indicator timelines.
- **Email Body Preview**: Sanitized body content preview.
- **Page Numbers & Footers**: "Page X of Y" with confidentiality classification markers.

#### Response (`HTTP 200 OK`)

- **Content-Type**: `application/pdf`
- **Content-Disposition**: `inline; filename="SM-1048-forensic-report.pdf"`
- **Body**: Binary PDF stream.

---

### 6. List Threat Campaigns

**`GET /api/campaigns`** ([`server/routes/campaigns.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/campaigns.ts#L8-L32))

Returns aggregated threat campaigns clustered across multiple inbound phishing or BEC cases.

#### Response (`HTTP 200 OK`)

```json
[
  {
    "id": "camp-8819-fin-fraud",
    "name": "Targeted AP Impersonation Cluster (Harborline / FreightLogix)",
    "severity": "critical",
    "case_count": 3,
    "shared_indicators": [
      "reply_to:accounting@harbor1ine-logistics.com",
      "bank_account:8841",
      "domain:harbor1ine-logistics.com"
    ],
    "first_seen": "2026-09-01T10:14:00.000Z",
    "last_seen": "2026-09-07T04:25:00.000Z",
    "case_ids": ["SM-1037", "SM-1042", "SM-1048"],
    "victim_teams": ["Accounts Payable", "Treasury Operations"],
    "domains": ["harbor1ine-logistics.com"],
    "reply_tos": ["accounting@harbor1ine-logistics.com"],
    "bank_accounts": ["8841"],
    "attachment_hashes": ["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    "recommended_actions": [
      "Add harbor1ine-logistics.com to enterprise perimeter blocklist",
      "Flag bank depository ending in 8841 in ERP master vendor table"
    ]
  }
]
```

---

### 7. Get Campaign Detail with Linked Cases

**`GET /api/campaigns/:campaignId`** ([`server/routes/campaigns.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/campaigns.ts#L35-L94))

Fetches detailed campaign cluster information including an embedded array of case summaries for all linked incident cases.

#### Parameters

- `campaignId`: (Path parameter, Required) Campaign ID.

#### Response (`HTTP 200 OK`)

Returns the [`Campaign`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/types.ts#L151-L167) object with populated `cases: CaseSummary[]` containing all linked incidents.

#### Error Responses

- `HTTP 404 Not Found`: Campaign not found.

---

### 8. List Vendor Profiles

**`GET /api/vendors`** ([`server/routes/vendors.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/vendors.ts#L9-L39))

Lists all monitored supplier and partner profiles against which inbound emails are behaviorally verified.

#### Security

- **Authentication**: Required (`Bearer <token>`)
- **Tenant Isolation**: Scoped to the caller's organization.

#### Response (`HTTP 200 OK`)

```json
[
  {
    "id": "v-harborline-001",
    "name": "Harborline Freight & Logistics",
    "trusted_domains": ["harborline-logistics.com"],
    "trusted_contacts": ["invoicing@harborline-logistics.com", "billing@harborline-logistics.com"],
    "approved_bank_suffixes": ["1142", "6609"],
    "normal_recipients": ["ap@astermanufacturing.com", "finance@astermanufacturing.com"],
    "risk_state": "watch",
    "last_interaction": "2026-09-07T04:25:00.000Z",
    "relationship_since": "2023-04-15T00:00:00.000Z",
    "anomalies": [
      {
        "label": "Unauthorized Depository Suffix",
        "detail": "Requested payment to unrecognized account suffix 8841",
        "severity": "critical",
        "at": "2026-09-07T04:25:00.000Z"
      }
    ]
  }
]
```

_(Note: `GET /api/vendors/:vendorId` is also available to fetch an individual vendor with linked `related_case_ids`.)_

---

### 9. Create Vendor Profile

**`POST /api/vendors`** ([`server/routes/vendors.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/vendors.ts#L86-L126))

Registers a new vendor behavioral baseline.

#### Security

- **Authentication**: Required (`Bearer <token>`)
- **RBAC**: Requires role `analyst` or `admin`.

#### Request Body

```json
{
  "name": "Apex Industrial Supplies",
  "trusted_domains": ["apex-industrial.com"],
  "trusted_contacts": ["orders@apex-industrial.com", "accounts@apex-industrial.com"],
  "approved_bank_suffixes": ["4491"],
  "normal_recipients": ["purchasing@astermanufacturing.com"]
}
```

#### Response (`HTTP 201 Created`)

```json
{
  "id": "8c42b0f4-d53f-4e08-9df2-a39c97b81928",
  "name": "Apex Industrial Supplies",
  "trusted_domains": ["apex-industrial.com"],
  "trusted_contacts": ["orders@apex-industrial.com", "accounts@apex-industrial.com"],
  "approved_bank_suffixes": ["4491"],
  "normal_recipients": ["purchasing@astermanufacturing.com"],
  "risk_state": "trusted",
  "relationship_since": "2026-09-07T04:25:00.000Z",
  "anomalies": []
}
```

_(Note: `PUT /api/vendors/:vendorId` is also supported for updating an existing vendor's baseline domains, contacts, and bank suffixes.)_

---

### 10. System Health Check

**`GET /api/health`** ([`server/index.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L69-L75))

Public service health probe. Mounted prior to the authentication middleware.

#### Security

- **Authentication**: None (Public)

#### Response (`HTTP 200 OK`)

```json
{
  "status": "ok",
  "database": "postgresql",
  "timestamp": "2026-09-07T04:25:00.000Z"
}
```

_(The `database` property returns `"postgresql"`, `"mongodb"`, or `"memory"` depending on active connection drivers)._

---

### 11. Current Tenant & User Context

**`GET /api/tenants/current`** ([`server/routes/tenants.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/tenants.js#L14-L20))

Returns context regarding the active organization and authenticated user or API key principal.

#### Security

- **Authentication**: Required (`Bearer <token>`)

#### Response (`HTTP 200 OK`)

```json
{
  "tenant": {
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "Sentinel Corporation",
    "slug": "sentinel-corp",
    "plan": "enterprise"
  },
  "user": {
    "id": "00000000-0000-0000-0000-000000000002",
    "firebaseUid": "FIREBASE_UID_STRING",
    "email": "security-admin@sentinelmail.io",
    "name": "Security Admin",
    "role": "admin"
  }
}
```

---

### 12. Generate API Key

**`POST /api/tenants/api-keys`** ([`server/routes/tenants.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/tenants.js#L47-L64))

Generates a new scoped enterprise API key for automation pipelines, SIEM/SOAR connectors, or ingestion gateways.

#### Security

- **Authentication**: Required (`Bearer <token>`)
- **RBAC**: Requires `admin` role.

#### Request Body

```json
{
  "name": "M365 Production Mailbox Ingestion Worker",
  "role": "analyst"
}
```

#### Response (`HTTP 201 Created`)

```json
{
  "message": "Store this API key securely. It will not be shown again.",
  "apiKey": "sm_live_9f83a2bc0d41e784532b918a38c201d4a837190f8423ba91",
  "name": "M365 Production Mailbox Ingestion Worker",
  "prefix": "sm_live_9f83a2",
  "role": "analyst",
  "created_at": "2026-09-07T04:25:00.000Z"
}
```

---

### 13. Microsoft 365 Webhook Ingestion

**`POST /api/ingest/m365/webhook`** ([`server/routes/ingest.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L83-L132))

Microsoft Graph Change Notification webhook receiver for real-time mailbox monitoring.

#### Modes of Operation

#### Mode A: Microsoft Graph Handshake Challenge

When creating or renewing a Graph subscription, Microsoft sends an initial validation request with a query parameter `validationToken`:

- **Request**: `POST /api/ingest/m365/webhook?validationToken=abc123Challenge`
- **Response**: `HTTP 200 OK`
- **Content-Type**: `text/plain`
- **Body**: `abc123Challenge` (Echoes back the token as required by Microsoft Graph specifications).

#### Mode B: Direct EML Ingestion

Direct EML payload pushed from an ingestion agent or Graph forwarder:

- **Request Body**:
  ```json
  {
    "raw_eml": "From: billing@partner.com\nTo: ap@company.com\nSubject: Invoice\n\n...",
    "filename": "inbound-message-992.eml"
  }
  ```
- **Execution**: Dispatches to [`processIngestedMessage()`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/ingestion-processor.js#L15-L230) to parse, score, create a case, and trigger auto-containment if threshold is exceeded.
- **Response**: `HTTP 201 Created`
  ```json
  {
    "status": "ingested",
    "case_id": "c-9a4f210e-8f2a-4c28-98e3-0d5b78b01234",
    "case_number": "SM-1049",
    "threat_class": "invoice_fraud",
    "risk_score": 88
  }
  ```

#### Mode C: Standard Microsoft Graph Change Notification Batch

Standard subscription notification payload:

- **Request Body**:
  ```json
  {
    "value": [
      {
        "subscriptionId": "sub-12345",
        "resource": "Users/ap@astermanufacturing.com/Messages/AAMkAG...",
        "changeType": "created"
      }
    ]
  }
  ```
- **Response**: `HTTP 202 Accepted`
  ```json
  {
    "message": "M365 notifications accepted for processing.",
    "events": [
      {
        "subscriptionId": "sub-12345",
        "resource": "Users/ap@astermanufacturing.com/Messages/AAMkAG...",
        "changeType": "created",
        "status": "queued"
      }
    ]
  }
  ```

---

## Supplemental Organization & Connector Endpoints

For administrative integration, the following management routes are also provided:

- **`GET /api/tenants/api-keys`** ([`server/routes/tenants.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/tenants.js#L37-L44)): List active API key metadata (`admin` only).
- **`POST /api/tenants/organizations`** ([`server/routes/tenants.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/tenants.js#L23-L34)): Provision a new enterprise organization tenant (`admin` only).
- **`GET /api/tenants/users`** ([`server/routes/tenants.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/tenants.js#L67-L74)): List team members in the tenant organization (`admin` or `auditor`).
- **`POST /api/tenants/users`** ([`server/routes/tenants.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/tenants.js#L77-L93)): Provision a new team member with assigned role (`admin` only).
- **`GET /api/ingest/connectors`** ([`server/routes/ingest.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L13-L50)): List configured M365 and Google Workspace mailbox connectors.
- **`POST /api/ingest/connectors`** ([`server/routes/ingest.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L53-L80)): Register a new mailbox connector (`admin` only).
- **`POST /api/ingest/google/webhook`** ([`server/routes/ingest.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L137-L175)): Google Cloud Pub/Sub push listener for Gmail watch notifications.

---

## Core TypeScript Schema Definitions

Reference types defined in [`server/types.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated/Sentinel-Mail-main/server/types.ts):

```typescript
export type Severity = "critical" | "high" | "medium" | "low" | "safe";

export type ThreatClass =
  "invoice_fraud" | "ceo_impersonation" | "credential_phishing" | "malware_delivery" | "benign";

export type AnalystDecision =
  "pending" | "safe" | "payment_held" | "escalated" | "confirmed_threat";

export type AnalystActionType = "mark_safe" | "hold_payment" | "escalate" | "confirm_threat";

export interface AnalystAction {
  type: AnalystActionType;
  note?: string;
  analyst?: string;
  created_at?: string;
}

export interface CaseSummary {
  id: string;
  case_number: string;
  subject: string;
  sender: string;
  threat_class: ThreatClass;
  risk_score: number;
  severity: Severity;
  decision: AnalystDecision;
  assigned_action?: string;
  vendor?: string;
  amount_at_risk?: number;
  triage_minutes?: number;
  currency?: string;
  created_at: string;
}

export interface Case extends CaseSummary {
  confidence: number;
  decision_banner: string;
  recipients?: string[];
  body_preview?: string;
  org_id?: string;
  connector_id?: string;
  evidence: Evidence;
  timeline: TimelineEntry[];
  relay_path: RelayHop[];
  campaign_id?: string;
  campaign_graph?: CampaignGraphData;
  actions?: AnalystAction[];
}
```
