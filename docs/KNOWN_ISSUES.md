# SentinelMail Known Issues & Resolution Status

This document tracks architectural drift, previous technical debt, and their current resolution status in the SentinelMail codebase.

All six critical architectural and functional gaps previously identified have been **resolved**. This document details the resolutions implemented across the frontend and backend, as well as the remaining operational caveats.

---

## Issue Status Matrix

| #   | Prior Issue                          | Status          | Resolution Summary                                                                                                                                                                                                                                                     |
| --- | ------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Missing Backend & Database**       | ✅ **RESOLVED** | Express backend running in `server/` with PostgreSQL (`pg`), MongoDB, and `MemoryStore` fallback. 9 SQL migrations present. `src/server.ts` proxies API requests to port 3001 with explicit 502 handling. `npm run start` launches both frontend and API concurrently. |
| 2   | **Missing LLM / AI Integration**     | ✅ **RESOLVED** | Dual-engine AI classifier implemented in `server/services/classifier.ts` supporting Google Gemini and OpenAI GPT-4o-mini, with automatic fallback to deterministic rule-based analysis.                                                                                |
| 3   | **PDF Report Generation**            | ✅ **RESOLVED** | Binary PDF generation implemented via `pdfkit` in `server/services/pdf-report.ts`. Served as `application/pdf` by `server/routes/cases.ts`. Frontend `reportExtension` evaluates to `"pdf"` in live mode.                                                              |
| 4   | **Campaign Aggregation**             | ✅ **RESOLVED** | Multi-indicator correlation engine implemented in `server/services/campaign.ts`. IOC extraction links cases by shared domains, IPs, URLs, reply-to addresses, and bank accounts. Served by `server/routes/campaigns.ts`.                                               |
| 5   | **Authentication & Authorization**   | ✅ **RESOLVED** | `server/middleware/auth.js` enforces authentication using Firebase ID tokens (verified via `firebase-admin`) and enterprise API keys (`sm_live_...`) with RBAC. Frontend (`src/lib/api.ts`) attaches Bearer tokens to all requests.                                    |
| 6   | **Vite 6 / Render Deployment Hacks** | ✅ **RESOLVED** | Permissive `allowedHosts: true` replaced with environment-driven `ALLOWED_HOSTS` configuration in `vite.config.ts`. Frontend API client fetch timeout extended from 6 seconds to 30 seconds to support cold starts and deep analysis.                                  |

---

## Detailed Resolutions

### 1. Backend & Database Architecture

- **Prior State**: The `server/` directory did not exist. The application relied on an in-memory handler (`src/lib/local-api.server.ts`) embedded in the Nitro SSR process. Data was lost across redeployments, and the PostgreSQL driver was unused.
- **Current Implementation**:
  - A standalone Express API application is established in `server/index.ts`, listening on port 3001 (or `PORT`).
  - Database connectivity in `server/db/connection.ts` supports:
    - **PostgreSQL**: Production connection pooling via `pg.Pool` when `DATABASE_URL` is set.
    - **MongoDB**: Document storage via `server/db/mongo.ts` when `MONGODB_URI` is set.
    - **MemoryStore**: In-memory data store for local prototyping when no external database is configured.
  - Database migration framework in `server/db/migrate.ts` manages 9 SQL migrations (`server/db/migrations/001_vendors.sql` through `server/db/migrations/009_campaign_schema_alignment.sql`), creating schemas for cases, vendors, campaigns, indicators, analyst actions, multitenancy, and RBAC.
  - `src/server.ts` intercepts `/api/*` paths and proxies them directly to `http://localhost:3001`. If the Express server is offline, it returns an explicit `502 Bad Gateway` error rather than falling back to local mock handlers.
  - The production `start` script in `package.json` executes `concurrently` to run both the frontend SSR build (`npm run start:frontend`) and the Express backend (`npm run start:api`).

### 2. LLM / AI Forensic Classification

- **Prior State**: The `openai` package was installed but unused. Threat detection was restricted to basic string-matching heuristics.
- **Current Implementation**:
  - `server/services/classifier.ts` implements a layered classification pipeline:
    - **Layer 1 (Deterministic Rules)**: `classifyRules` analyzes parsed `.eml` structures, regex patterns, payment directives, and attachment signatures.
    - **Layer 2 (Generative AI Overlay)**:
      - Primary: Google Gemini (`callGemini`) when `GEMINI_API_KEY` is configured.
      - Secondary: OpenAI GPT-4o-mini (`callOpenAI`) when `OPENAI_API_KEY` is configured.
    - **Synthesis**: The engine merges rule signals with AI reasoning, adjusting confidence scores and extracting malicious phrasing. If AI APIs are unavailable or unconfigured, the system safely falls back to deterministic rule scoring.

### 3. Forensic PDF Report Generation

- **Prior State**: `/api/cases/:id/report` generated ASCII plain-text tables returned as `text/plain`, saved as `.txt` files in the browser despite being labeled as PDF downloads.
- **Current Implementation**:
  - `server/services/pdf-report.ts` uses `pdfkit` (`PDFDocument`) to generate binary PDF documents with header branding, case metadata, threat classification badges, risk score meters, IOC tables, and audit history.
  - `server/routes/cases.ts` serves the generated buffer with `Content-Type: application/pdf` and `Content-Disposition: inline; filename="<case_number>-forensic-report.pdf"`.
  - In `src/lib/api.ts`, `reportExtension` dynamically resolves to `"pdf"` in live mode (`DEMO_MODE ? "txt" : "pdf"`), ensuring downloads use the `.pdf` extension.

### 4. Campaign Aggregation & IOC Correlation

- **Prior State**: The `GET /api/campaigns` endpoint was stubbed to return an empty array `[]`. The UI relied on a frontend fallback to static mock campaign data.
- **Current Implementation**:
  - `server/services/campaign.ts` provides `extractAndCorrelate()`, which extracts atomic indicators of compromise (IOCs) including domains, URLs, sender/reply-to addresses, attachment hashes, relay IPs, and bank account numbers.
  - Multi-indicator matching: If two or more distinct indicator types correlate with prior incidents, the engine creates or links cases to a `Campaign` cluster and updates the incident graph.
  - `server/routes/campaigns.ts` serves live campaign clusters and linked case lists from PostgreSQL or the active datastore.

### 5. Authentication & Enterprise RBAC

- **Prior State**: Frontend authentication through Firebase was decoupled from API routes; endpoints lacked token validation and allowed unauthenticated access.
- **Current Implementation**:
  - `server/middleware/auth.js` (`tenantAuthMiddleware`) guards protected routes:
    - **Firebase ID Tokens**: Validated using `firebase-admin` via `firebaseAuth.verifyIdToken()`. Resolved user identities are matched against organization records for tenant isolation.
    - **Enterprise API Keys**: Validates `sm_live_...` bearer tokens with role-based access control (RBAC) supporting `admin`, `analyst`, and `viewer` roles.
  - `src/lib/api.ts` extracts the current user's Firebase ID token via `getIdToken()` and attaches it as an `Authorization: Bearer <token>` header to all outgoing requests.

### 6. Deployment Configuration & Network Resiliency

- **Prior State**: `vite.config.ts` used `allowedHosts: true` to bypass Vite 6 Host header security checks on Render, and `api.ts` used an aggressive 6-second timeout that prematurely aborted live requests during cold starts.
- **Current Implementation**:
  - `vite.config.ts` parses the `ALLOWED_HOSTS` environment variable (comma-delimited) with fallback to `localhost`, eliminating wildcard host allowance.
  - Vite dev server configures a dedicated reverse proxy routing `/api` directly to `http://localhost:3001`.
  - The request timeout in `src/lib/api.ts` has been increased to 30 seconds (`30_000` ms) to accommodate container spin-up latencies on cloud platforms (e.g., Render free tier) and LLM inference duration.

---

## Remaining Operational Caveats

While the core functionality is fully operational, the following operational requirements and behaviors should be noted:

1. **In-Memory `MemoryStore` Ephemerality**:
   - When neither `DATABASE_URL` (PostgreSQL) nor `MONGODB_URI` (MongoDB) is configured, the server defaults to an in-memory `MemoryStore`.
   - Data produced in this mode (ingested cases, campaign links, analyst triage decisions, custom vendors) is stored in volatile memory and resets upon server restart.
   - **Production Requirement**: Configure `DATABASE_URL` and run `npm run db:migrate` to enable persistent PostgreSQL storage.

2. **AI Classification Requires API Keys**:
   - Layer 2 AI classification in `server/services/classifier.ts` requires either `GEMINI_API_KEY` (Google Gemini) or `OPENAI_API_KEY` (OpenAI GPT-4o-mini).
   - If neither environment variable is defined, the system executes only Layer 1 deterministic rule-based analysis. Cases are still scored and classified, but without generative reasoning or semantic phrase extraction.

3. **Firebase Admin Credentials for Backend Authentication**:
   - Backend verification of Firebase user tokens requires either the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable (containing service account credentials as JSON) or standard Google Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`).
   - If unconfigured, Firebase ID token verification will fail, rejecting client requests that authenticate via Firebase.

4. **Legacy `src/lib/local-api.server.ts` File**:
   - The file `src/lib/local-api.server.ts` remains present in the filesystem from prior iterations.
   - It is no longer imported, referenced, or used by `src/server.ts` or any active application paths. All API traffic routes through `server/` via the reverse proxy.
