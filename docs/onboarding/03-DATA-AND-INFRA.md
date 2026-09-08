# SentinelMail Engineering Onboarding: Data Layer and Infrastructure

Welcome to SentinelMail. This guide covers the complete **data layer, database schema, storage infrastructure, and operational environment**.

This document is written for an engineer joining the project with zero prior context. It describes the data layer **as it actually exists and executes today in the codebase**, verified against the code in [`server/db/`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/), every SQL migration in [`server/db/migrations/`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/), and runtime environment configurations.

---

## Table of Contents
1. [The Storage Architecture: Three-Tier Cascade](#1-the-storage-architecture-three-tier-cascade)
2. [The Schema & Migration Inventory](#2-the-schema--migration-inventory)
3. [What's Actually Persisted vs. In-Memory-Only](#3-whats-actually-persisted-vs-in-memory-only)
4. [Multi-Backend Consistency & Parity Matrix](#4-multi-backend-consistency--parity-matrix)
5. [Environment & Configuration Audit](#5-environment--configuration-audit)
6. [Running It Locally: Verified Runbook](#6-running-it-locally-verified-runbook)
7. [Known Gaps & Data-Layer Risks](#7-known-gaps--data-layer-risks)

---

## 1. The Storage Architecture: Three-Tier Cascade

SentinelMail supports **three database backends**:
1. **PostgreSQL** (Primary relational store with ACID transactions, migrations, and foreign keys)
2. **MongoDB** (Secondary fallback document store using native MongoDB collections)
3. **MemoryStore** (Ephemeral tertiary in-memory JavaScript Map/array store for zero-config local development)

### 1.1 Cascade Selection & Priority Order

During application boot in [`server/index.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L22-L96), the server evaluates the environment and initializes storage using an explicit, prioritized fallback cascade:

```mermaid
flowchart TD
    Start["Server Boot (server/index.ts)"] --> CheckPG{"Is DATABASE_URL set?"}
    
    CheckPG -- Yes --> InitPG["initDbPool() in server/db/connection.ts\n(connectionTimeoutMillis: 2000)"]
    CheckPG -- No --> CheckMongo{"Is MONGODB_URI or\nMONGODB_URL set?"}
    
    InitPG -- "Connection Success" --> RunMig["runMigrations() in server/db/migrate.ts"]
    RunMig -- "Migrations Success" --> ActivePG["Active: PostgreSQL\n(connectedTier = 'postgresql')"]
    RunMig -- "Migrations Fail" --> FatalMig["FATAL: Abort Startup\nprocess.exit(1)"]
    
    InitPG -- "Connection Failure" --> WarnPG["⚠️ Log PostgreSQL Unreachable Warning"]
    WarnPG --> CheckMongo
    
    CheckMongo -- Yes --> InitMongo["initMongoDb() in server/db/mongo.ts\n(serverSelectionTimeoutMS: 3000)"]
    CheckMongo -- No --> DegradeCheck{"Is NODE_ENV === 'production'?"}
    
    InitMongo -- "Connection Success" --> AutoSeed["ensureIndexes() + autoSeed()\nserver/db/mongo.ts"]
    AutoSeed --> ActiveMongo["Active: MongoDB\n(connectedTier = 'mongodb')"]
    InitMongo -- "Connection Failure" --> WarnMongo["⚠️ Log MongoDB Unreachable Warning"]
    WarnMongo --> DegradeCheck
    
    DegradeCheck -- "Yes & DB configured" --> FatalProd["FATAL: Refusing to degrade to MemoryStore in production\nprocess.exit(1)"]
    DegradeCheck -- "No (dev/test)" --> ActiveMem["Active: Ephemeral MemoryStore\n⚠️ LOUD ASCII WARNING BANNER"]
```

### 1.2 Step-by-Step Cascade Mechanics

1. **Tier 1 — PostgreSQL (Primary)**:
   - Evaluates `process.env["DATABASE_URL"]`.
   - If present, invokes `initDbPool()` in [`server/db/connection.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L47-L80).
   - `initDbPool()` constructs a `pg.Pool` with a 2,000 ms connection timeout and attempts to acquire and release a test client.
   - If successful, sets module-level flag `isPostgresActive = true`, exports `realPool`, and marks `connectedTier = "postgresql"`.
   - The server immediately runs database migrations via `runMigrations()` in [`server/db/migrate.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrate.ts#L10-L97). **Critical safeguard:** If migrations throw an error, startup aborts immediately via `process.exit(1)` to prevent running against an out-of-date schema.
   - If PostgreSQL cannot be reached within 2 seconds, `initDbPool()` catches the error, sets `isPostgresActive = false`, and execution falls through to Tier 2.

2. **Tier 2 — MongoDB (Secondary Fallback)**:
   - Evaluates `process.env["MONGODB_URI"] || process.env["MONGODB_URL"]`.
   - If Tier 1 was not established and a MongoDB URI is present, invokes `initMongoDb()` in [`server/db/mongo.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/mongo.ts#L148-L201).
   - Connects using `MongoClient` with `serverSelectionTimeoutMS: 3000` and `connectTimeoutMS: 4000`.
   - If successful, sets `isMongoActive = true`, initializes collection references, creates indexes via `ensureIndexes()`, and executes `autoSeed()`.
   - Sets `connectedTier = "mongodb"`.
   - If MongoDB cannot be reached within 3 seconds, `initMongoDb()` catches the error, sets `isMongoActive = false`, and execution falls through to Tier 3.

3. **Tier 3 — MemoryStore (Tertiary Ephemeral Fallback)**:
   - If `connectedTier === "none"`, the system lands in `MemoryStore` mode.
   - **Production Barrier:** [`server/index.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L80-L85) evaluates:
     ```typescript
     if (process.env["NODE_ENV"] === "production" && (hasPgConfig || hasMongoConfig)) {
       console.error("FATAL: Configured database (PostgreSQL/MongoDB) is unreachable in production mode. Refusing to degrade to ephemeral MemoryStore in production.");
       process.exit(1);
     }
     ```
   - In local development or test mode, the application boots using the in-process `memoryStore` instance defined in [`server/db/connection.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L13-L42).

### 1.3 Silent vs. Loud Fallback: The Direct Verification

> [!IMPORTANT]
> **Audit Resolution:** Past audits had conflicting claims regarding whether backend fallback occurs silently or loudly. **Direct code verification confirms fallback is EXTREMELY LOUD.**

The system emits prominent, multi-line ASCII warning banners at two distinct layers:

1. **Driver Level ([`server/db/connection.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L68-L75))**:
   ```
   ========================================================================
     ⚠️   CRITICAL DATABASE WARNING: POSTGRESQL UNREACHABLE
     ------------------------------------------------------------------------
     Target: postgresql://postgres:***@localhost:5432/sentinelmail
     Reason: connect ECONNREFUSED 127.0.0.1:5432
     ACTION: Falling back to EPHEMERAL in-memory MemoryStore.
     ⚠️   WARNING: DATA WILL NOT PERSIST ACROSS PROCESS RESTARTS!
   ========================================================================
   ```

2. **Application Server Level ([`server/index.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L87-L94))**:
   ```
   ==============================================================================
     ⚠️   WARNING: OPERATING IN EPHEMERAL IN-MEMORY STORAGE (MemoryStore) FALLBACK
     --------------------------------------------------------------------------
     Neither PostgreSQL nor MongoDB could be reached.
     The server is running on zero-config in-memory storage.
     ⚠️   CUSTOMER DATA (CASES, CAMPAIGNS, API KEYS) WILL NOT PERSIST ON RESTART!
   ==============================================================================
   ```

3. **Per-Query Fallback Behavior ([`server/db/connection.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L97-L115))**:
   When an active PostgreSQL connection fails mid-flight:
   - In **production mode** (`NODE_ENV === "production"`): It throws immediately (`"CRITICAL: PostgreSQL query failed in production"` or `"503: Primary database is unreachable in production mode"`). It **NEVER** silently falls back to MemoryStore during production queries.
   - In **development mode**: It logs `⚠️ PostgreSQL query failed, falling back to local MemoryStore: <err>` and falls through to MongoDB or the in-memory SQL parser.

---

## 2. The Schema & Migration Inventory

The relational PostgreSQL schema is managed via 12 ordered SQL migration files in [`server/db/migrations/`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/). The migration runner [`server/db/migrate.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrate.ts) executes each migration inside an atomic transaction (`BEGIN` / `COMMIT`) and tracks applied files in the table `schema_migrations`.

### 2.1 Complete Table & Collection Inventory

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : "belongs to (org_id)"
    ORGANIZATIONS ||--o{ API_KEYS : "owns (org_id)"
    ORGANIZATIONS ||--o{ MAILBOX_CONNECTORS : "configures (org_id)"
    ORGANIZATIONS ||--o{ VENDORS : "maintains (org_id)"
    ORGANIZATIONS ||--o{ CASES : "scopes (org_id)"
    ORGANIZATIONS ||--o{ CAMPAIGNS : "aggregates (org_id)"
    
    VENDORS ||--o{ CASES : "matches (vendor_id)"
    MAILBOX_CONNECTORS ||--o{ CASES : "ingests (connector_id)"
    CASES ||--o{ INDICATORS : "extracts (case_id)"
    CASES ||--o{ ACTIONS : "records (case_id)"
```

#### 1. `organizations`
- **Created in**: [`008_multitenancy_and_rbac.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/008_multitenancy_and_rbac.sql#L3-L11)
- **Purpose**: Root multi-tenant isolation unit.
- **Columns**:
  - `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Unique organization ID.
  - `name` (`TEXT NOT NULL`): Human-readable organization name.
  - `slug` (`TEXT UNIQUE NOT NULL`): URL-safe identifier (e.g. `sentinel-corp`).
  - `plan` (`TEXT NOT NULL DEFAULT 'enterprise'`): Subscription tier.
  - `settings` (`JSONB NOT NULL DEFAULT '{"auto_hold_threshold": 80, "containment_channels": ["slack", "webhook"]}'`): Policy settings.
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`): Record creation timestamp.
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`): Record last updated timestamp.
- **Indexes**: Primary key index on `id`, unique index on `slug`.
- **MongoDB Collection**: `organizations` with unique indexes on `{ id: 1 }` and `{ slug: 1 }`.

#### 2. `users`
- **Created in**: [`008_multitenancy_and_rbac.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/008_multitenancy_and_rbac.sql#L13-L24)
- **Purpose**: Organization members, RBAC roles, and login identities.
- **Columns**:
  - `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): User identifier.
  - `org_id` (`UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`): Owning tenant.
  - `email` (`TEXT NOT NULL`): User email address.
  - `name` (`TEXT NOT NULL`): Display name.
  - `role` (`TEXT NOT NULL DEFAULT 'analyst'`): One of `admin`, `finance_approver`, `analyst`, `auditor`.
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
- **Constraints & Indexes**: `UNIQUE(org_id, email)`, `idx_users_org` on `org_id`.
- **MongoDB Collection**: `users` with unique indexes on `{ id: 1 }`, `{ email: 1 }`, and index on `{ org_id: 1 }`.

#### 3. `api_keys`
- **Created in**: [`008_multitenancy_and_rbac.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/008_multitenancy_and_rbac.sql#L25-L37)
- **Purpose**: Headless authentication for pollers, webhooks, and automation connectors.
- **Columns**:
  - `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Key ID.
  - `org_id` (`UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`): Owning tenant.
  - `name` (`TEXT NOT NULL`): Descriptive key label.
  - `key_hash` (`TEXT NOT NULL`): SHA-256 digest of raw key (never plaintext).
  - `prefix` (`TEXT NOT NULL`): Public display prefix (e.g. `sm_live_3f224b`).
  - `role` (`TEXT NOT NULL DEFAULT 'admin'`): Permission tier for key.
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
  - `last_used` (`TIMESTAMPTZ`): Timestamp of last authenticated request.
- **Indexes**: `idx_api_keys_hash` on `key_hash`, `idx_api_keys_org` on `org_id`.
- **MongoDB Collection**: `api_keys` with unique indexes on `{ id: 1 }`, `{ key_hash: 1 }`, and index on `{ org_id: 1 }`.

#### 4. `mailbox_connectors`
- **Created in**: [`008_multitenancy_and_rbac.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/008_multitenancy_and_rbac.sql#L38-L52)
- **Purpose**: Email ingestion configurations (Microsoft 365 Graph / Google Workspace PubSub).
- **Columns**:
  - `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Connector identifier.
  - `org_id` (`UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`): Owning tenant.
  - `provider` (`TEXT NOT NULL`): `m365` or `google_workspace`.
  - `name` (`TEXT NOT NULL`): Connector display name.
  - `mailbox` (`TEXT NOT NULL`): Monitored email inbox (e.g. `ap@company.com`).
  - `status` (`TEXT NOT NULL DEFAULT 'active'`): `active`, `paused`, or `error`.
  - `config` (`JSONB NOT NULL DEFAULT '{}'`): OAuth tokens, client IDs, tenant configs.
  - `messages_synced` (`INTEGER NOT NULL DEFAULT 0`): Metric counter of ingested messages.
  - `last_sync_at` (`TIMESTAMPTZ`): Timestamp of last delivery.
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
- **Indexes**: `idx_connectors_org` on `org_id`.
- **MongoDB Collection**: `mailbox_connectors` with unique index on `{ id: 1 }` and index on `{ org_id: 1 }`.

#### 5. `vendors`
- **Created in**: [`001_vendors.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/001_vendors.sql)
- **Altered in**: [`008_multitenancy_and_rbac.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/008_multitenancy_and_rbac.sql#L54-L55) (added `org_id`)
- **Purpose**: Trusted baseline profiles used by the behavioral analysis engine.
- **Columns**:
  - `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Vendor profile identifier.
  - `org_id` (`UUID REFERENCES organizations(id)`): Owning tenant.
  - `name` (`TEXT NOT NULL`): Vendor name.
  - `trusted_domains` (`TEXT[] NOT NULL DEFAULT '{}'`): Whitelist of authorized sending domains.
  - `trusted_contacts` (`TEXT[] NOT NULL DEFAULT '{}'`): Whitelist of known sender emails.
  - `approved_bank_suffixes` (`TEXT[] NOT NULL DEFAULT '{}'`): Whitelist of verified account digits.
  - `normal_recipients` (`TEXT[] NOT NULL DEFAULT '{}'`): Internal employees who normally interact with vendor.
  - `risk_state` (`TEXT NOT NULL DEFAULT 'trusted'`): `trusted`, `watch`, or `at_risk`.
  - `last_interaction` (`TIMESTAMPTZ`): Timestamp of last communication.
  - `relationship_since` (`TIMESTAMPTZ`): Inception date of vendor partnership.
  - `anomalies` (`JSONB NOT NULL DEFAULT '[]'`): Rolling historical log of detected anomalies.
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
- **Indexes**: `idx_vendors_domains` (GIN on `trusted_domains`), `idx_vendors_org` on `org_id`.
- **MongoDB Collection**: `vendors` with unique index on `{ id: 1 }`, indexes on `{ trusted_domains: 1 }` and `{ name: 1 }`.

#### 6. `cases`
- **Created in**: [`002_cases.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/002_cases.sql)
- **Altered in**:
  - [`008_multitenancy_and_rbac.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/008_multitenancy_and_rbac.sql#L57-L61) (added `org_id`, `connector_id`)
  - [`012_cases_forensic_columns.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/012_cases_forensic_columns.sql) (added `triage_minutes`, `origin_assessment`, `domain_intelligence`)
- **Purpose**: Core forensic case entity created for every analyzed or ingested email.
- **Columns**:
  - `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Unique internal case UUID.
  - `case_number` (`TEXT UNIQUE NOT NULL`): Human-facing sequential ID (e.g. `SM-1043`).
  - `org_id` (`UUID REFERENCES organizations(id)`): Owning tenant.
  - `connector_id` (`UUID REFERENCES mailbox_connectors(id)`): Source mailbox connector (nullable if manual upload).
  - `subject` (`TEXT NOT NULL`): Email subject line.
  - `sender` (`TEXT NOT NULL`): `From` header address.
  - `recipients` (`TEXT[]`): `To` and `Cc` recipient addresses.
  - `threat_class` (`TEXT NOT NULL`): `invoice_fraud`, `ceo_impersonation`, `credential_phishing`, `malware_delivery`, or `benign`.
  - `risk_score` (`INTEGER NOT NULL`): 0–100 fused risk score.
  - `severity` (`TEXT NOT NULL`): `critical`, `high`, `medium`, `low`, or `safe`.
  - `confidence` (`REAL NOT NULL`): Classification confidence (0.0–1.0).
  - `decision` (`TEXT NOT NULL DEFAULT 'pending'`): `pending`, `payment_held`, `safe`, `escalated`, `confirmed_threat`.
  - `assigned_action` (`TEXT`): Recommended operator action (e.g. `Hold payment`, `Review required`).
  - `decision_banner` (`TEXT`): High-visibility warning text shown in UI header.
  - `vendor_id` (`UUID REFERENCES vendors(id)`): Matched vendor profile.
  - `vendor_name` (`TEXT`): Matched vendor name.
  - `amount_at_risk` (`NUMERIC`): Extracted currency amount.
  - `currency` (`TEXT`): Extracted ISO currency symbol (e.g. `USD`, `EUR`).
  - `body_preview` (`TEXT`): First 400 characters of plain-text body.
  - `evidence` (`JSONB NOT NULL`): Deep structured forensic payload (`sender_identity`, `financial`, `intent`, `technical`, `vendor_relationship`).
  - `timeline` (`JSONB NOT NULL DEFAULT '[]'`): Ordered forensic event timeline items.
  - `relay_path` (`JSONB NOT NULL DEFAULT '[]'`): Parsed `Received` header hops with IP enrichment.
  - `origin_assessment` (`JSONB`): Authentication alignment, DKIM/SPF verification breakdown.
  - `domain_intelligence` (`JSONB`): WHOIS, RDAP age, registrar, name servers, MX records.
  - `campaign_id` (`TEXT`): Associated campaign cluster ID (if correlated).
  - `campaign_graph` (`JSONB`): Graph nodes and edges representing shared IOC relationships.
  - `raw_eml` (`BYTEA`): Full raw RFC 822 email buffer.
  - `eml_sha256` (`TEXT`): SHA-256 hash of raw email for deduplication.
  - `triage_minutes` (`NUMERIC`): Calculated elapsed minutes between ingestion and analyst decision.
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
- **Indexes**:
  - `idx_cases_threat` on `threat_class`
  - `idx_cases_severity` on `severity`
  - `idx_cases_created` on `created_at DESC`
  - `idx_cases_campaign` on `campaign_id`
  - `idx_cases_vendor` on `vendor_id`
  - `idx_cases_org` on `org_id`
  - `idx_cases_connector` on `connector_id`
- **MongoDB Collection**: `cases` with unique index on `{ case_number: 1 }` and indexes on `{ created_at: -1 }`, `{ vendor_id: 1 }`, `{ campaign_id: 1 }`, `{ threat_class: 1 }`, `{ severity: 1 }`.

#### 7. `campaigns`
- **Created in**: [`003_campaigns.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/003_campaigns.sql)
- **Altered in**:
  - [`008_multitenancy_and_rbac.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/008_multitenancy_and_rbac.sql#L62-L63) (added `org_id` UUID)
  - [`009_campaign_schema_alignment.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/009_campaign_schema_alignment.sql) (added `case_count`, `recommended_actions`, `created_at`, `updated_at`)
  - [`010_campaigns_org_id.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/010_campaigns_org_id.sql) (enforced `org_id NOT NULL`)
- **Purpose**: Groups coordinated attack clusters sharing ≥2 distinct indicator types.
- **Columns**:
  - `id` (`TEXT PRIMARY KEY`): Cluster identifier (e.g. `camp-ad4dff00`).
  - `org_id` (`UUID / TEXT NOT NULL`): Owning tenant.
  - `name` (`TEXT NOT NULL`): Descriptive cluster name (e.g. `apexcloud-divert.com cluster`).
  - `severity` (`TEXT NOT NULL`): Cluster severity.
  - `shared_indicators` (`TEXT[] NOT NULL DEFAULT '{}'`): Correlated indicators (`type:value`).
  - `first_seen` (`TIMESTAMPTZ NOT NULL`): First message received in cluster.
  - `last_seen` (`TIMESTAMPTZ NOT NULL`): Most recent message received.
  - `case_ids` (`TEXT[] NOT NULL DEFAULT '{}'`): Array of linked case numbers (e.g. `['SM-1042', 'SM-1043']`).
  - `case_count` (`INTEGER NOT NULL DEFAULT 0`): Count of linked cases.
  - `victim_teams` (`TEXT[]`): Targeted departments (e.g. `['Treasury', 'AP']`).
  - `domains` (`TEXT[]`): Associated attacker domains.
  - `reply_tos` (`TEXT[]`): Associated off-domain Reply-To mailboxes.
  - `bank_accounts` (`TEXT[]`): Associated fraudulent bank account suffixes.
  - `attachment_hashes` (`TEXT[]`): Associated malicious attachment SHA-256 hashes.
  - `recommended_actions` (`TEXT[] NOT NULL DEFAULT '{}'`): Containment playbooks.
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
  - `updated_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
- **Indexes**: Primary key on `id`, `idx_campaigns_org` on `org_id`.
- **MongoDB Collection**: `campaigns` with unique index on `{ id: 1 }` and index on `{ last_seen: -1 }`.

#### 8. `indicators`
- **Created in**: [`004_indicators.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/004_indicators.sql)
- **Altered in**: [`011_indicators_unique_idx.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/011_indicators_unique_idx.sql) (unique index on `case_id, type, value`)
- **Purpose**: Normalized atomized Indicators of Compromise (IOCs) used for fast multi-type correlation joins.
- **Columns**:
  - `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Indicator ID.
  - `case_id` (`UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE`): Associated case.
  - `type` (`TEXT NOT NULL`): `domain`, `url`, `reply_to`, `bank_account`, `attachment_hash`, `ip`.
  - `value` (`TEXT NOT NULL`): Indicator value.
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
- **Indexes**:
  - `idx_indicators_type_value` on `(type, value)`
  - `idx_indicators_case` on `case_id`
  - `idx_indicators_case_type_val` (`UNIQUE (case_id, type, value)`)
- **MongoDB Collection**: `indicators` with indexes on `{ case_id: 1 }` and `{ type: 1, value: 1 }`.

#### 9. `actions`
- **Created in**: [`005_actions.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/005_actions.sql)
- **Purpose**: Audit trail of human analyst and automated containment actions.
- **Columns**:
  - `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Action log ID.
  - `case_id` (`UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE`): Target case.
  - `type` (`TEXT NOT NULL`): `hold_payment`, `mark_safe`, `escalate`, `confirm_threat`.
  - `note` (`TEXT`): Optional analyst reasoning.
  - `analyst` (`TEXT`): User name or API service identifier.
  - `created_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`)
- **Indexes**: `idx_actions_case` on `case_id`.
- **MongoDB Collection**: `actions` with indexes on `{ case_id: 1 }` and `{ created_at: 1 }`.

#### 10. `case_number_seq` (PostgreSQL Sequence)
- **Created in**: [`006_case_number_seq.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/006_case_number_seq.sql)
- **Definition**: `CREATE SEQUENCE case_number_seq START WITH 1042;`
- **MongoDB Equivalent**: `counters` collection document `{ _id: "case_number", seq: 1043 }`.

---

## 3. What's Actually Persisted vs. In-Memory-Only

A common trap for new engineers is assuming that because a table or model exists in code, the data survives a process restart. In SentinelMail, write paths vary significantly depending on whether the backend is PostgreSQL, MongoDB, or MemoryStore, and several critical features maintain in-memory caches regardless of the active database.

### 3.1 Complete Data Persistence Inventory

| Data Entity | Write Path & File Location | Survives Restart (PostgreSQL) | Survives Restart (MongoDB) | Survives Restart (MemoryStore) | Notes |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Forensic Cases** | `INSERT INTO cases` in [`analyze.ts:L268`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/analyze.ts#L268) & [`ingestion-processor.js:L203`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/ingestion-processor.js#L203) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, written to `memoryStore.cases` JS `Map`. Discarded on process exit. |
| **Raw EML Payloads** | Stored in `cases.raw_eml` as binary `BYTEA` / `Buffer` | ✅ **YES** | ✅ **YES** | ❌ **NO** | Stored on case record. In PG, downloaded via `/api/cases/:caseId/raw`. |
| **Vendor Baselines** | `INSERT INTO vendors` in [`vendors.ts:L87`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/vendors.ts#L87) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, written to `memoryStore.vendors` JS `Map`. |
| **Campaign Clusters** | `INSERT INTO campaigns` in [`campaign.ts:L184`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/campaign.ts#L184) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, written to `memoryStore.campaigns` JS `Map`. |
| **Indicators (IOCs)** | `INSERT INTO indicators` in [`campaign.ts:L73`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/campaign.ts#L73) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, appended to `memoryStore.indicators` array. |
| **Analyst Actions** | `INSERT INTO actions` in [`cases.ts:L167`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/cases.ts#L167) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, written to `memoryStore.actions` JS `Map`. |
| **Organizations** | `INSERT INTO organizations` in [`tenant.js:L147`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/tenant.js#L147) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, written to `memOrgs` JS `Map` in `tenant.js`. |
| **Users** | `INSERT INTO users` in [`tenant.js:L262`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/tenant.js#L262) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, written to `memUsers` JS `Map` in `tenant.js`. |
| **API Keys** | `INSERT INTO api_keys` in [`tenant.js:L65`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/tenant.js#L65) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, written to `memApiKeys` JS `Map`. Default dev key auto-seeded. |
| **Mailbox Connectors**| `INSERT INTO mailbox_connectors` in [`ingest.js:L190`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L190) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, written to `memConnectors` JS `Map` in `ingest.js`. |
| **Case Counter Sequence** | `case_number_seq` (PG) / `counters` doc (Mongo) | ✅ **YES** | ✅ **YES** | ❌ **NO** | In MemoryStore, increments `memoryStore.caseSeq`. Resets to 1043 on restart! |
| **IP Intelligence Cache** | `cache` JS `Map` in [`ip-intelligence.ts:L3`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/ip-intelligence.ts#L3) | ❌ **NO** | ❌ **NO** | ❌ **NO** | **Always In-Memory-Only.** FIFO LRU cache (max 1,000 items). Lost on restart. |
| **Domain & RDAP Cache** | `domainCache` JS `Map` in [`domain-intelligence.ts:L12`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/domain-intelligence.ts#L12) | ❌ **NO** | ❌ **NO** | ❌ **NO** | **Always In-Memory-Only.** 24-hour TTL in-memory map. Lost on restart. |
| **Webhook Rate Limits** | `rateLimitMap` JS `Map` in [`ingest.js:L14`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L14) | ❌ **NO** | ❌ **NO** | ❌ **NO** | **Always In-Memory-Only.** Sliding-window rate limiter (30 req/min/IP). Lost on restart. |
| **Analyze Rate Limits** | `analyzeRateLimits` JS `Map` in [`analyze.ts:L16`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/analyze.ts#L16) | ❌ **NO** | ❌ **NO** | ❌ **NO** | **Always In-Memory-Only.** 10 uploads/min/IP. Lost on restart. |

---

## 4. Multi-Backend Consistency & Parity Matrix

The codebase was recently verified via a comprehensive 27-check automated test suite ([`server/test-backend-parity.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/test-backend-parity.ts)). Here is the breakdown of how each functional capability is supported across backends:

```mermaid
graph LR
    subgraph PostgreSQL [Tier 1: PostgreSQL]
        PG_SQL["Native SQL Engine"]
        PG_ACID["Real ACID Transactions"]
        PG_FK["DB-Enforced Foreign Keys & Cascades"]
        PG_SEQ["Atomic DB Sequence"]
    end
    
    subgraph MongoDB [Tier 2: MongoDB]
        MG_DOC["Native Collections"]
        MG_AGG["Emulated Joins in Driver"]
        MG_IDX["Unique & Performance Indexes"]
        MG_CTR["Atomic Counter Document"]
    end
    
    subgraph MemoryStore [Tier 3: MemoryStore]
        MS_MAP["JS Map & Array Lookups"]
        MS_REG["Regex AST SQL Parsing"]
        MS_RAM["RAM Mutex Counters"]
    end
```

### 4.1 Feature Parity Matrix

| Feature Area | PostgreSQL | MongoDB | MemoryStore Fallback | Engineering Details |
| :--- | :---: | :---: | :---: | :--- |
| **Multi-Tenant Isolation** | **FULL** | **FULL** | **FULL** | Every query in `cases`, `vendors`, `campaigns`, and `tenants` is scoped by `org_id`. Verified in parity suite (Area 5). |
| **Campaign Correlation** | **FULL** | **FULL** *(Emulated)* | **FULL** *(Emulated)* | PostgreSQL executes a native multi-table self-join (`JOIN indicators i2 ... HAVING COUNT(DISTINCT i2.type) >= 2`). MongoDB and MemoryStore implement full emulation in [`connection.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L1223-L1269) and [`connection.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L621-L655). |
| **Behavioral Analytics** | **FULL** | **FULL** *(Emulated)* | **FULL** *(Emulated)* | Checks historical Reply-Tos, writing style TF-IDF cosine similarity, and circular mean send hours. MongoDB and MemoryStore emulate JSON path extraction and hour math. |
| **Authentication & RBAC** | **FULL** | **FULL** | **FULL** | Validates API key hashes (`sm_live_...`), resolves users by email, and enforces roles (`admin`, `analyst`, `auditor`). |
| **Atomic Case Sequencing** | **FULL** | **FULL** | **PARTIAL** | PG uses `case_number_seq`. Mongo uses atomic `findOneAndUpdate({ _id: "case_number" }, { $inc: { seq: 1 } })`. MemoryStore uses in-memory variable `caseSeq++` (non-atomic across workers, resets on restart). |
| **ACID Transactions** | **FULL** | **NONE** *(Mocked)* | **NONE** *(Mocked)* | In PostgreSQL, `getClient()` provides real connection clients with `BEGIN`, `COMMIT`, and `ROLLBACK`. In Mongo/MemoryStore, `getClient()` returns a stub whose `query()` returns `{ rows: [] }` for transaction keywords without throwing, but does not provide rollback safety. |
| **Foreign Key Cascades** | **FULL** | **PARTIAL** | **NONE** | PG enforces `ON DELETE CASCADE` at the engine level. Mongo and MemoryStore do not cascade deletes unless explicitly coded. |
| **Initial Vendor Baselines** | **UUID IDs** | **String IDs (`v-1`)** | **String IDs (`v-1`)** | **Gotcha:** Migration `007_seed_vendors.sql` inserts UUIDs (`a1111111-...`), whereas MongoDB and MemoryStore auto-seed from `seed-data.ts` (`v-1`, `v-2`, `v-3`). |

---

## 5. Environment & Configuration Audit

SentinelMail reads 29 environment variables across the backend, ingestion engine, and frontend build system. 

### 5.1 Environment Variable Audit Table

| Environment Variable | Where It Is Read | What It Controls | What Happens If Missing? | In `.env.example`? |
| :--- | :--- | :--- | :--- | :---: |
| `DATABASE_URL` | [`server/index.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L25), [`connection.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L48), [`migrate.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrate.ts#L11) | PostgreSQL connection string | Skips Tier 1 PostgreSQL and cascades to MongoDB. | ✅ Yes |
| `MONGODB_URI` / `MONGODB_URL` | [`server/index.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L26), [`mongo.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/mongo.ts#L149) | MongoDB connection URI | Skips Tier 2 MongoDB and cascades to MemoryStore. | ✅ Yes (`MONGODB_URI`) |
| `MONGODB_DB_NAME` | [`server/db/mongo.ts:L154`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/mongo.ts#L154) | MongoDB database name | Defaults to `"sentinelmail"`. | ✅ Yes |
| `PORT` / `API_PORT` | [`server/index.ts:L20`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L20) | Express backend listening port | Defaults to `3001`. | ✅ Yes |
| `NODE_ENV` | [`server/index.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L80), [`auth.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/middleware/auth.js#L83), [`tenant.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/tenant.js#L90) | Runtime environment mode | Defaults to development. In production, prevents MemoryStore fallback and enforces strict auth. | ⚠️ Implicit |
| `CORS_ORIGIN` | [`server/index.ts:L101`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L101) | Comma-delimited list of allowed HTTP origins | Defaults to `http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000`. | ❌ **Missing** |
| `GEMINI_API_KEY` | [`server/index.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L171), [`classifier.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/classifier.ts#L115) | Google Gemini API key | Bypasses Gemini and attempts OpenAI fallback. | ✅ Yes |
| `GEMINI_MODEL` | [`classifier.ts:L185`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/classifier.ts#L185) | Preferred Gemini model name | Defaults to `"gemini-2.5-flash"`. | ✅ Yes |
| `OPENAI_API_KEY` | [`classifier.ts:L124`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/classifier.ts#L124) | OpenAI API key for fallback | AI layer disabled; uses deterministic rules-only classifier. | ✅ Yes |
| `IPINFO_TOKEN` | [`ip-intelligence.ts:L19`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/ip-intelligence.ts#L19) | IPinfo.io token for relay IP enrichment | Logs warning, skips ASN/country enrichment, caches null. | ✅ Yes |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | [`firebase-admin.js:L5`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/firebase-admin.js#L5) | Firebase service account credentials JSON | Falls back to Google Application Default Credentials (`applicationDefault()`). | ✅ Yes |
| `SENTINEL_API_KEY` | [`mailbox_poller.py:L26`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/ingestion/mailbox_poller.py#L26) | API key for mailbox ingestion connector script | Authentication error on poller script upload. | ✅ Yes |
| `SENTINEL_API_URL` | [`mailbox_poller.py:L25`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/ingestion/mailbox_poller.py#L25) | API URL for ingestion script | Defaults to `http://localhost:3001`. | ✅ Yes |
| `SENTINEL_TENANT_ID` | [`mailbox_poller.py:L27`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/ingestion/mailbox_poller.py#L27) | Target tenant ID for polled emails | Defaults to `sentinel-corp`. | ✅ Yes |
| `CONTAINMENT_WEBHOOK_URL` | [`containment.ts:L24`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/containment.ts#L24) | Generic webhook endpoint for incident alerts | Generic webhook alert channel is disabled. | ✅ Yes |
| `SLACK_WEBHOOK_URL` | [`containment.ts:L54`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/containment.ts#L54) | Slack incoming webhook URL | Slack alert channel is disabled. | ✅ Yes |
| `TEAMS_WEBHOOK_URL` | [`containment.ts:L101`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/containment.ts#L101) | Microsoft Teams Adaptive Card webhook URL | Teams alert channel is disabled. | ✅ Yes |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ALERT_EMAIL_TO` | [`containment.ts:L161-L170`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/containment.ts#L161-L170) | SMTP outbound alert credentials | Outbound email containment alerts are skipped. | ✅ Yes |
| `INGESTION_API_KEY` | [`ingest.js:L70`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L70) | Master API key allowing direct EML injection via webhooks | Only tenant-specific `sm_live_...` API keys accepted. | ❌ **Missing** |
| `M365_CLIENT_STATE` | [`ingest.js:L272`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L272) | Shared secret validating Microsoft Graph webhook notifications | In production, rejects M365 notifications missing `clientState`. | ❌ **Missing** |
| `PUBSUB_VERIFICATION_TOKEN` | [`ingest.js:L344`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L344) | Verification token for Google Pub/Sub push webhooks | Unauthenticated Google webhooks accepted in dev mode. | ❌ **Missing** |
| `BACKEND_URL` / `INTERNAL_API_URL` | [`src/server.ts:L10`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/src/server.ts#L10) | Internal backend address for SSR API proxying | Defaults to `http://localhost:3001`. | ❌ **Missing** |
| `NITRO_PRESET` | [`vite.config.ts:L41`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/vite.config.ts#L41) | Server build target preset | Defaults to `"node-server"`. | ❌ **Missing** |
| `ALLOWED_HOSTS` | [`vite.config.ts:L12`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/vite.config.ts#L12) | Vite dev server host header whitelist | Defaults to allowing standard local hosts. | ✅ Yes |
| `VITE_API_BASE_URL` | Frontend API client | API endpoint prefix | Empty string uses same-origin `/api` proxy. | ✅ Yes |
| `VITE_DEMO_MODE` | Frontend client | Bypasses backend; uses static frontend demo fixtures | Defaults to `"false"` (queries live backend). | ✅ Yes |
| `VITE_GOOGLE_CLIENT_ID` | Frontend client | Google Workspace OAuth client ID | Google SSO button disabled. | ✅ Yes |
| `VITE_FIREBASE_*` | Frontend client | Firebase Client SDK web configuration | Firebase client auth disabled. | ✅ Yes |

### 5.2 Flagged Discrepancies Against `.env.example`

> [!WARNING]
> The following environment variables are actively read by backend and build code but are **completely missing from `.env.example`**:
> 1. `INGESTION_API_KEY`: Read in [`server/routes/ingest.js:L70`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L70) for authenticating direct `.eml` webhook ingest payloads.
> 2. `M365_CLIENT_STATE`: Read in [`server/routes/ingest.js:L272`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L272) for verifying Microsoft Graph webhook deliveries.
> 3. `PUBSUB_VERIFICATION_TOKEN`: Read in [`server/routes/ingest.js:L344`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L344) for verifying Google Cloud Pub/Sub push messages.
> 4. `CORS_ORIGIN`: Read in [`server/index.ts:L101`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/index.ts#L101) for configuring CORS origins.
> 5. `BACKEND_URL`: Read in [`src/server.ts:L10`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/src/server.ts#L10) for configuring server-side proxy routing in containerized deployments.

---

## 6. Running It Locally: Verified Runbook

These steps were **directly executed and verified** on a clean checkout.

### Step 1: Install Dependencies
```bash
npm install
```
*Verification*: Installs Node.js dependencies including `pg` (v8.23.0), `mongodb` (v7.6.0), `tsx`, and `mongodb-memory-server` (v11.2.0).

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
For zero-config local development, you do not need to edit anything. The server will run out of the box using Tier 3 `MemoryStore` or cascade to local PostgreSQL/MongoDB if running.

### Step 3: Choose Your Database Backend Option

#### Option A: PostgreSQL (Recommended Production-Mirror Setup)
1. Ensure PostgreSQL is running locally on port 5432:
   ```bash
   # Example via Docker:
   docker run --name sentinel-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sentinelmail -p 5432:5432 -d postgres:16
   ```
2. Set `DATABASE_URL` in `.env`:
   ```ini
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sentinelmail
   ```
3. Run migrations:
   ```bash
   npm run db:migrate
   ```
   *Verified Output*:
   ```
   ✅ Connected to PostgreSQL database.
   Running migration: 001_vendors.sql
   ...
   All migrations applied successfully.
   Migration check complete.
   ```

#### Option B: MongoDB
1. Ensure MongoDB is running on port 27017:
   ```bash
   # Example via Docker:
   docker run --name sentinel-mongo -p 27017:27017 -d mongo:7
   ```
2. Comment out `DATABASE_URL` and set `MONGODB_URI` in `.env`:
   ```ini
   # DATABASE_URL=
   MONGODB_URI=mongodb://localhost:27017/sentinelmail
   MONGODB_DB_NAME=sentinelmail
   ```
3. No migration command needed. Index creation and initial seeding run automatically on first boot.

#### Option C: Zero-Config In-Memory Fallback (`MemoryStore`)
1. Ensure `DATABASE_URL` and `MONGODB_URI` are either commented out or point to non-running hosts.
2. The server will automatically start on Tier 3 `MemoryStore`, pre-populating baseline vendors and demo cases in memory.

### Step 4: Launch the Application

- **Run Backend API Server only (Port 3001)**:
  ```bash
  npm run server
  ```
  *(Executes `tsx watch server/index.ts` with hot reloading)*

- **Run Frontend UI only (Port 3000)**:
  ```bash
  npm run dev
  ```
  *(Executes `vite dev`)*

- **Run Both Concurrently (Full Stack)**:
  ```bash
  npm run dev:full
  ```
  *(Runs Vite on `http://localhost:3000` and Express API on `http://localhost:3001`)*

### Step 5: Verify Local Operation

1. **API Health Probe**:
   ```bash
   curl http://localhost:3001/api/health
   ```
   *Expected Response*:
   ```json
   {
     "status": "ok",
     "database": "postgresql",
     "timestamp": "2026-09-08T06:37:41.000Z"
   }
   ```

2. **Run the Automated Test Suite**:
   ```bash
   npm test
   ```
   *Verified Result*: Executes `vitest run`, passing 17/17 tests across scoring, classifier exploit closures, and tenant isolation.

3. **Run the 3-Tier Backend Parity Suite**:
   ```bash
   npx tsx server/test-backend-parity.ts
   ```
   *Verified Result*: Spins up an in-process MongoDB instance alongside PostgreSQL and MemoryStore, executing 27/27 parity checks across all 9 operational areas.

---

## 7. Known Gaps & Data-Layer Risks

The following issues were directly observed in the current data layer code:

### 1. Destructive `DELETE FROM campaigns` in Migration 010
In [`server/db/migrations/010_campaigns_org_id.sql:L8`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/010_campaigns_org_id.sql#L8), the migration executes:
```sql
DELETE FROM campaigns;
ALTER TABLE campaigns ALTER COLUMN org_id SET NOT NULL;
```
> [!CAUTION]
> If migration 010 is executed against a database with pre-existing customer campaign data, it **permanently deletes every campaign record** in order to enforce the `NOT NULL` constraint on `org_id`. In a production upgrade, this migration would cause data loss unless backfilled with default organization IDs.

### 2. Vendor Seed ID Divergence Between Backends
- In PostgreSQL, [`007_seed_vendors.sql`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/migrations/007_seed_vendors.sql) seeds vendor IDs as UUIDs:
  - `a1111111-1111-1111-1111-111111111111` (*Harborline Logistics*)
  - `b2222222-2222-2222-2222-222222222222` (*Apex Global Cloud*)
  - `c3333333-3333-3333-3333-333333333333` (*Stratton Legal Advisory*)
- In MongoDB and MemoryStore, [`server/db/seed-data.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/seed-data.ts#L6-L56) seeds vendor IDs as simple strings:
  - `v-1` (*Supply Co Industrial*)
  - `v-2` (*Apex Global Cloud*)
  - `v-3` (*Harborline Logistics*)
Any test or integration script expecting `v-1` will fail on PostgreSQL, and vice-versa.

### 3. Missing ACID Atomicity in MongoDB & MemoryStore
In [`server/services/campaign.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/campaign.ts#L67-L232), campaign extraction and score re-fusion executes multiple dependent mutations:
1. Insert indicators
2. Query matched clusters
3. Insert or update campaign record
4. Update case campaign links
5. Update case campaign graph

In PostgreSQL, this is wrapped in a real transactional `BEGIN` / `COMMIT`. In MongoDB and MemoryStore, `getClient()` in [`connection.ts:L1348-L1357`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L1348-L1357) provides a mock client where `BEGIN` and `COMMIT` are no-ops. If the server crashes midway through campaign fusion while running on MongoDB or MemoryStore, the database will be left in a corrupted, partially updated state.

### 4. Non-Persistent Case Sequences in MemoryStore
In PostgreSQL, `case_number_seq` persists on disk. In MongoDB, `counters` collection persists `{ _id: "case_number", seq: 1043 }`. In MemoryStore, `caseSeq` is an in-memory number initialized to `1043` in the class constructor. Every process restart resets the counter to `1043`, causing case number collisions (`SM-1043`, `SM-1044`) across dev restarts.

### 5. In-Memory Process-Bound Rate Limiters & Caches
Four internal data stores are implemented as process-local JavaScript `Map` instances without Redis or persistent backing:
- `rateLimitMap` in [`server/routes/ingest.js:L14`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L14)
- `analyzeRateLimits` in [`server/routes/analyze.ts:L16`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/analyze.ts#L16)
- `cache` in [`server/services/ip-intelligence.ts:L3`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/ip-intelligence.ts#L3)
- `domainCache` in [`server/services/domain-intelligence.ts:L12`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/domain-intelligence.ts#L12)
If SentinelMail is deployed in a multi-pod Kubernetes cluster or behind a load balancer, each instance maintains separate rate limit counters and separate cache states. An attacker could rotate requests across replicas to bypass the upload limits.

### 6. Case Insert Column Ordering Discrepancy
- In [`server/routes/analyze.ts:L269-L274`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/analyze.ts#L269-L274), the SQL query specifies `org_id` as the **2nd column** (`INSERT INTO cases (id, org_id, case_number, ...)`).
- In [`server/services/ingestion-processor.js:L203-L208`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/ingestion-processor.js#L203-L208), the SQL query specifies `org_id` as the **25th column** (`INSERT INTO cases (id, case_number, ... raw_eml, eml_sha256, org_id)`).
While PostgreSQL handles explicit column lists gracefully, the mock SQL query engines in [`connection.ts:L245`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L245) and [`connection.ts:L855`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/server/db/connection.ts#L855) had to be augmented with regex-based column-to-parameter index maps (`pMap`) to prevent severe parameter misalignment. Any future raw insert that omits this regex mapping will corrupt stored records on non-PostgreSQL backends.
