# SentinelMail — Real Backend: PostgreSQL, Behavioral Engine, AI Classification, Campaign Correlation & Containment

## Context

SentinelMail currently has:

- A polished React frontend (TanStack Start + Vite + Nitro) with screens for analysis upload, case investigation, vendor profiles, campaigns, and settings
- A working in-memory local API ([local-api.server.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/src/lib/local-api.server.ts)) that handles `/api/*` routes
- A real `.eml` parser ([eml-analysis.server.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/src/lib/eml-analysis.server.ts)) that extracts headers, body, attachments, SPF/DKIM/DMARC, Reply-To, URLs, bank details, and relay hops
- A deterministic rule-based classifier with 5 threat classes
- Demo fixtures ([demo-data.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/src/lib/demo-data.ts)) used only when `VITE_DEMO_MODE=true`
- All data is lost on server restart (in-memory `Map` storage)

This plan adds **persistent PostgreSQL storage**, a **vendor behavioral engine**, **AI-assisted classification with explainable scoring**, **campaign correlation**, and **containment alert integrations** — all behind the same `/api/*` interface the frontend already uses.

## Architecture Decision

> [!IMPORTANT]
> **The backend will be a standalone Express server** (`server/`) running alongside the Vite dev server, rather than embedded inside Nitro/TanStack Start.
>
> Rationale:
>
> - PostgreSQL drivers (`pg`) and Node.js crypto APIs need a full Node.js runtime, not Cloudflare Workers
> - Separation keeps the frontend deployable to edge (Cloudflare) while the API runs on a VPS/container
> - The frontend already supports `VITE_API_BASE_URL` for external API connections
> - In development, we'll proxy `/api/*` from Vite to the Express server

## User Review Required

> [!IMPORTANT]
> **PostgreSQL connection**: You will need a PostgreSQL instance running locally or remotely. The plan uses `DATABASE_URL` in `.env`. Do you already have PostgreSQL installed, or should I include Docker Compose setup?

> [!IMPORTANT]
> **AI classification**: For the AI-powered intent classifier, I plan to use the **OpenAI API** (GPT-4o-mini for cost efficiency). The deterministic rule engine remains the primary scorer — AI adds a confidence overlay. Do you want a different LLM provider, or is OpenAI acceptable? The system degrades gracefully if no API key is set (rule-based only).

> [!IMPORTANT]
> **Containment alerts**: The plan implements "Hold Payment" as a **webhook + email notification** (configurable Slack/Teams/SMTP). This does NOT auto-modify payments. Is that the right scope?

## Open Questions

1. **Demo data seeding**: Should the three demo scenarios (fake-domain invoice fraud, genuine-vendor compromised mailbox, coordinated campaign) be seeded into PostgreSQL on first run, or only populated through actual `.eml` uploads?

2. **Multi-tenancy**: Is this single-organization for now (one set of vendors/cases), or should the schema support `org_id` from day one?

3. **Deployment target**: Will the Express backend run on a VPS, Docker, or a PaaS like Railway/Render? This affects the migration strategy.

---

## Proposed Changes

### 1. Backend Server Infrastructure

#### [NEW] [server/](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/) — Express API Server

```
server/
├── index.ts              # Express entry point, middleware, route mounting
├── db/
│   ├── connection.ts     # pg Pool from DATABASE_URL
│   ├── migrate.ts        # Schema migration runner (plain SQL files)
│   └── migrations/
│       ├── 001_cases.sql
│       ├── 002_vendors.sql
│       ├── 003_campaigns.sql
│       ├── 004_indicators.sql
│       └── 005_actions_audit.sql
├── routes/
│   ├── analyze.ts        # POST /api/analyze — .eml upload + full pipeline
│   ├── cases.ts          # GET/POST /api/cases, /api/cases/:id, /api/cases/:id/action, /api/cases/:id/report
│   ├── vendors.ts        # CRUD /api/vendors
│   └── campaigns.ts      # GET /api/campaigns
├── services/
│   ├── eml-parser.ts     # Port of eml-analysis.server.ts to Node.js (Buffer-based)
│   ├── behavioral.ts     # Vendor behavioral comparison engine
│   ├── classifier.ts     # AI + deterministic fusion classifier
│   ├── campaign.ts       # Campaign correlation engine
│   ├── scoring.ts        # Evidence fusion: combines all signals into explainable score
│   └── containment.ts    # Webhook/email alert for Hold Payment
├── types.ts              # Shared types (mirrors frontend sentinel.ts)
└── tsconfig.json         # Node.js-targeted tsconfig
```

---

### 2. Database Schema (PostgreSQL)

#### [NEW] [server/db/migrations/001_cases.sql](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/db/migrations/001_cases.sql)

```sql
-- Cases table stores the full forensic case created from each analyzed email
CREATE TABLE cases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number   TEXT UNIQUE NOT NULL,     -- SM-1042
  subject       TEXT NOT NULL,
  sender        TEXT NOT NULL,
  recipients    TEXT[],
  threat_class  TEXT NOT NULL,            -- invoice_fraud | ceo_impersonation | credential_phishing | malware_delivery | benign
  risk_score    INTEGER NOT NULL,
  severity      TEXT NOT NULL,            -- critical | high | medium | low | safe
  confidence    REAL NOT NULL,
  decision      TEXT NOT NULL DEFAULT 'pending',
  assigned_action TEXT,
  decision_banner TEXT,
  vendor_id     UUID REFERENCES vendors(id),
  vendor_name   TEXT,
  amount_at_risk NUMERIC,
  currency      TEXT,
  body_preview  TEXT,
  evidence      JSONB NOT NULL,           -- Full Evidence object
  timeline      JSONB NOT NULL DEFAULT '[]',
  relay_path    JSONB NOT NULL DEFAULT '[]',
  campaign_id   TEXT,
  campaign_graph JSONB,
  raw_eml       BYTEA,                    -- Original .eml bytes for re-analysis
  eml_sha256    TEXT,                     -- Dedup key
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cases_threat ON cases(threat_class);
CREATE INDEX idx_cases_severity ON cases(severity);
CREATE INDEX idx_cases_created ON cases(created_at DESC);
CREATE INDEX idx_cases_campaign ON cases(campaign_id);
CREATE INDEX idx_cases_vendor ON cases(vendor_id);
```

#### [NEW] [server/db/migrations/002_vendors.sql](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/db/migrations/002_vendors.sql)

```sql
-- Vendor profiles: the trusted baseline for behavioral comparison
CREATE TABLE vendors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  trusted_domains       TEXT[] NOT NULL DEFAULT '{}',
  trusted_contacts      TEXT[] NOT NULL DEFAULT '{}',
  approved_bank_suffixes TEXT[] NOT NULL DEFAULT '{}',
  normal_recipients     TEXT[] NOT NULL DEFAULT '{}',
  risk_state            TEXT NOT NULL DEFAULT 'trusted',  -- trusted | watch | at_risk
  last_interaction      TIMESTAMPTZ,
  relationship_since    TIMESTAMPTZ,
  anomalies             JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendors_domains ON vendors USING gin(trusted_domains);
```

#### [NEW] [server/db/migrations/003_campaigns.sql](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/db/migrations/003_campaigns.sql)

```sql
-- Campaign clusters: auto-generated from shared indicators across cases
CREATE TABLE campaigns (
  id                  TEXT PRIMARY KEY,        -- camp-XX
  name                TEXT NOT NULL,
  severity            TEXT NOT NULL,
  shared_indicators   TEXT[] NOT NULL DEFAULT '{}',
  first_seen          TIMESTAMPTZ NOT NULL,
  last_seen           TIMESTAMPTZ NOT NULL,
  case_ids            TEXT[] NOT NULL DEFAULT '{}',
  victim_teams        TEXT[],
  domains             TEXT[],
  reply_tos           TEXT[],
  bank_accounts       TEXT[],
  attachment_hashes   TEXT[],
  recommended_actions TEXT[],
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### [NEW] [server/db/migrations/004_indicators.sql](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/db/migrations/004_indicators.sql)

```sql
-- Extracted IOCs for campaign correlation: one row per indicator per case
CREATE TABLE indicators (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id   UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type      TEXT NOT NULL,   -- domain | url | reply_to | bank_account | attachment_hash | ip | phrase
  value     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_indicators_type_value ON indicators(type, value);
CREATE INDEX idx_indicators_case ON indicators(case_id);
```

#### [NEW] [server/db/migrations/005_actions_audit.sql](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/db/migrations/005_actions_audit.sql)

```sql
-- Analyst actions with audit trail
CREATE TABLE actions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,     -- mark_safe | hold_payment | escalate | confirm_threat
  note       TEXT,
  analyst    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_actions_case ON actions(case_id);
```

---

### 3. Behavioral Engine

#### [NEW] [server/services/behavioral.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/services/behavioral.ts)

For each email, compares against the matched vendor baseline:

| Check                  | What it compares                                                                                             | Signal produced                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **Domain match**       | Sender domain ∈ vendor.trusted_domains                                                                       | `vendor_domain_mismatch` (critical) |
| **Contact match**      | Sender address ∈ vendor.trusted_contacts                                                                     | `unknown_contact` (high)            |
| **Reply-To check**     | Reply-To address seen in past cases for this vendor                                                          | `unseen_reply_to` (critical)        |
| **Recipient pattern**  | To/CC addresses ∈ vendor.normal_recipients                                                                   | `unusual_recipient` (medium)        |
| **Bank account check** | Account suffix ∈ vendor.approved_bank_suffixes                                                               | `unknown_bank_account` (critical)   |
| **Writing pattern**    | Compares subject/body style against past vendor emails (cosine similarity on TF-IDF vectors, computed in JS) | `writing_style_anomaly` (medium)    |
| **Time-of-day**        | Compares send time against vendor's historical pattern                                                       | `unusual_send_time` (low)           |

The engine queries the `cases` table for the vendor's historical emails and builds a behavioral profile on the fly. Results populate `evidence.vendor_relationship` and add signals to the timeline.

---

### 4. AI Classification + Explainable Scoring

#### [NEW] [server/services/classifier.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/services/classifier.ts)

**Two-layer approach:**

1. **Deterministic rules** (existing logic from `eml-analysis.server.ts`): regex-based intent classification, produces base score
2. **AI overlay** (optional, when `OPENAI_API_KEY` is set): sends a structured prompt to GPT-4o-mini asking for:
   - Intent classification with confidence (0–1)
   - Top 3 supporting evidence phrases from the email body
   - Whether it agrees/disagrees with the rule-based classification

#### [NEW] [server/services/scoring.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/services/scoring.ts)

**Evidence fusion** — every score component is traceable:

```typescript
interface ScoringBreakdown {
  rule_based: { classification: ThreatClass; score: number; signals: EvidenceSignal[] };
  ai_overlay?: {
    classification: ThreatClass;
    confidence: number;
    agrees: boolean;
    phrases: string[];
  };
  behavioral: { signals: EvidenceSignal[]; score_delta: number };
  campaign: { match_count: number; score_delta: number };
  final_score: number; // Clamped 0–99
  final_classification: ThreatClass;
  final_confidence: number;
}
```

The five intents scored:

1. **Payment-change request** — weight 0.28 (detected from body regex + AI)
2. **New/unknown bank account** — weight 0.28 (behavioral engine vs. vendor baseline)
3. **Unseen Reply-To** — weight 0.20 (behavioral engine)
4. **Unusual recipient** — weight 0.12 (behavioral engine)
5. **Campaign match** — weight 0.12 (shared indicators across cases)

---

### 5. Campaign Correlation

#### [NEW] [server/services/campaign.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/services/campaign.ts)

After every case is created, the engine:

1. Extracts IOCs into the `indicators` table (domains, URLs, Reply-To, bank accounts, attachment hashes, relay IPs, key phrases)
2. Queries for other cases sharing ≥2 indicators of different types
3. If a cluster is found:
   - Creates or updates a `campaigns` row
   - Sets `campaign_id` on each linked case
   - Generates `campaign_graph` data (nodes + edges matching the frontend `CampaignGraphData` type)
   - Assigns severity based on the highest-severity case in the cluster

---

### 6. Containment Integration

#### [NEW] [server/services/containment.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/server/services/containment.ts)

When an analyst submits a "Hold Payment" action:

1. **Webhook** (if `CONTAINMENT_WEBHOOK_URL` is set): POST a JSON payload with case details, evidence summary, and recommended action
2. **Email alert** (if `SMTP_*` env vars are set): Sends a formatted email to the finance team with the forensic report
3. **Slack/Teams** (if `SLACK_WEBHOOK_URL` or `TEAMS_WEBHOOK_URL` is set): Posts a rich card with case number, risk score, vendor, amount at risk, and a link to the case

No automatic payment modifications — this is an alert/ticket system.

---

### 7. Frontend Wiring Changes

#### [MODIFY] [.env](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/.env)

Add `DATABASE_URL`, `OPENAI_API_KEY`, and containment webhook URLs.

#### [MODIFY] [.env.example](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/.env.example)

Document all new environment variables.

#### [MODIFY] [vite.config.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/vite.config.ts)

Add a dev proxy from `/api/*` to the Express server at `localhost:3001`.

#### [MODIFY] [server.ts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/src/server.ts)

In production, the `/api/*` handler still routes to the external backend. In dev, Vite proxies. Remove the local-api import for production builds (or keep it as a fallback when no `DATABASE_URL` is set).

#### [NEW] [package.json scripts](file:///c:/Users/dsaro/Downloads/Sentinel%20Mail/package.json)

Add:

- `"server": "tsx watch server/index.ts"` — runs the Express backend in dev
- `"dev:full": "concurrently \"npm run dev\" \"npm run server\""` — runs both
- `"db:migrate": "tsx server/db/migrate.ts"` — runs migrations

---

### 8. New Dependencies

**Backend (root package.json or server/package.json):**

- `express` + `@types/express` — HTTP server
- `multer` + `@types/multer` — multipart file upload
- `pg` + `@types/pg` — PostgreSQL driver
- `dotenv` — environment variable loading
- `openai` — AI classification (optional)
- `nodemailer` + `@types/nodemailer` — email alerts (optional)
- `tsx` — TypeScript execution for server
- `concurrently` — run frontend + backend together

---

## Verification Plan

### Automated Tests

```bash
# 1. Run database migrations
npm run db:migrate

# 2. Start the full stack
npm run dev:full

# 3. Test the API with curl

# Create a vendor baseline
curl -X POST http://localhost:3001/api/vendors \
  -H "Content-Type: application/json" \
  -d '{"name":"Harborline Metals","trusted_domains":["harborline-metals.com"],"trusted_contacts":["procurement@harborline-metals.com"],"approved_bank_suffixes":["1284","6630"],"normal_recipients":["ap@astermanufacturing.com"]}'

# Upload an .eml file for analysis
curl -X POST http://localhost:3001/api/analyze \
  -F "file=@test-invoice-fraud.eml"

# List cases
curl http://localhost:3001/api/cases

# Get case detail
curl http://localhost:3001/api/cases/{case_id}

# Submit analyst action
curl -X POST http://localhost:3001/api/cases/{case_id}/action \
  -H "Content-Type: application/json" \
  -d '{"type":"hold_payment","note":"Waiting for vendor callback"}'

# List campaigns
curl http://localhost:3001/api/campaigns

# List vendors
curl http://localhost:3001/api/vendors
```

### Manual Verification

1. **Upload scenario 1**: Fake-domain invoice fraud `.eml` → should produce critical case with domain mismatch, auth failures
2. **Upload scenario 2**: Genuine vendor compromised mailbox `.eml` → should detect behavioral anomaly (new bank account, new reply-to) despite passing SPF/DKIM/DMARC
3. **Upload scenario 3**: Two related emails → should auto-correlate into a campaign with shared indicators visible in the Campaign Graph
4. **Vendor Identity Graph**: After creating a vendor baseline and uploading a matching email, the graph should show the trusted→suspicious break
5. **Hold Payment action**: Should trigger webhook/email alert (if configured)
6. **Persistence**: Restart the server — all cases, vendors, campaigns should survive
7. **Frontend integration**: The Vite app at `localhost:5173` should fetch from the Express backend via proxy and render real data (no demo pill)
