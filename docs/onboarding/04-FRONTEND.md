# Frontend Engineering Guide & Onboarding Architecture

> **Audience**: New engineers joining the SentinelMail project with zero prior context.  
> **Scope**: Frontend client architecture (`src/`), UI routing, component hierarchy, API client interactions, state management, and parity with backend services (`server/`).

---

## 1. The Application Map

SentinelMail is built as a single-page application (SPA) using **TanStack Router** (`@tanstack/react-router`) with file-based routing, **TanStack Query** (`@tanstack/react-query`) for asynchronous server-state synchronization, and **Tailwind CSS** with **Radix UI** primitives and custom kinetic styling.

The root application shell and context providers are configured in [`src/routes/__root.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/__root.tsx) and wrapped by [`AppShell`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/AppShell.tsx). The router configuration and client initialization live in [`src/router.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/router.tsx), with auto-generated route definitions in [`src/routeTree.gen.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routeTree.gen.ts).

```
                             ┌───────────────────────┐
                             │      /sign-in         │
                             │ (Google SSO / Demo)   │
                             └──────────┬────────────┘
                                        │
                                        ▼
                             ┌───────────────────────┐
                             │           /           │
                             │  (Security Overview)  │
                             └──────────┬────────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                           ▼
  ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
  │      /cases       │       │     /analyze      │       │    /campaigns     │
  │ (Investigations)  │       │ (Ingestion & Lab) │       │ (Cluster Dossier) │
  └─────────┬─────────┘       └─────────┬─────────┘       └───────────────────┘
            │                           │
            ▼                           │
  ┌───────────────────┐                 │
  │  /cases/$caseId   │◄────────────────┘
  │ (Forensic Detail) │
  └───────────────────┘
            │
            ├───────────────────────────┐
            ▼                           ▼
  ┌───────────────────┐       ┌───────────────────┐
  │      /vendors     │       │     /settings     │
  │ (Vendor Directory)│       │(Keys & Connectors)│
  └───────────────────┘       └───────────────────┘
```

### Route-by-Route Breakdown

| Route Path | Route File | Primary Components | Purpose & Visual Content | Target Persona |
| :--- | :--- | :--- | :--- | :--- |
| `/sign-in` | [`src/routes/sign-in.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/sign-in.tsx) | `SignInPage`, `renderGoogleButton`, `ThemeToggle`, `SentinelLogoIcon` | Authentication landing page. Displays animated threat radar visual, simulated live incident intercept cards (`SM-1042`, `SM-1037`), Google Identity Services SSO button, and a 1-click **"Enter Demo Analyst Workspace"** button. | All unauthenticated users, prospective evaluators, and onboarding developers. |
| `/` | [`src/routes/index.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/index.tsx) | `Dashboard`, `CaseTable`, `RiskBadge`, `AnimatedCounter`, `TiltCard`, `FeaturedInvestigation` | Executive Security Overview. Features 4 top KPI metrics (Wire Capital Protected, Critical Interceptions, Median Triage Duration, Mailbox Ingestion status), an "Action Needed Now" banner for the highest-risk incident, threat distribution breakdowns, response status distribution, and a preview table of recent high-risk cases. | SOC Managers, Lead Security Analysts, and Accounts Payable (AP) Risk Managers. |
| `/cases` | [`src/routes/cases.index.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/cases.index.tsx) | `CasesPage`, `CasesFacetedFilterBar`, `CaseTable`, `CasePeekDrawer` | Investigations Queue. Complete inventory of all triaged email incidents. Includes interactive filter presets (`Critical & High`, `Wire Fraud Lures`, `Pending Action`, `High Exposure >$50k`), multi-faceted dropdown filters (Severity, Threat Type, Decision, Vendor), full-text search, and a slide-over `CasePeekDrawer` for rapid side-panel review without page navigation. | Tier 1 and Tier 2 Security Operations Center (SOC) Analysts triaging inbound alerts. |
| `/cases/$caseId` | [`src/routes/cases.$caseId.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/cases.$caseId.tsx) | `CaseDetail`, `RiskGauge`, `ThreatVectorDonut`, `BehavioralBaselineContrast`, `VendorIdentityGraph`, `CampaignGraph`, `RelayPathForensics`, `ActionModal` | Full Forensic Investigation Workspace. Comprehensive incident command center. Features an executive header with decision triggers, a behavioral baseline contrast widget, and a 4-tab workspace: (1) **Timeline & Signals**, (2) **Vendor Trust Chain**, (3) **Campaign Correlation**, (4) **Relay Path & Raw Message**. Supports one-click containment actions and forensic PDF report exports. | Senior Forensic Analysts, AP Financial Controllers, and Incident Response Handlers. |
| `/analyze` | [`src/routes/analyze.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/analyze.tsx) | `AnalyzePage`, `Dropzone`, `AttackScenarioCard`, `Stepper` | Message Ingestion & Attack Simulation Lab. Allows manual drag-and-drop ingestion of RFC-822 `.eml` files (up to 25 MB) with optional vendor baseline binding. Features 6 pre-configured synthetic attack scenarios (Compromised Vendor, Lookalike Domain, CEO Impersonation, Credential Phish, Malware Delivery, Benign Baseline) and a 6-stage animated pipeline stepper. | Security Analysts testing ad-hoc suspicious emails or running QA red-team scenarios. |
| `/campaigns` | [`src/routes/campaigns.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/campaigns.tsx) | `CampaignsPage`, `CampaignDrawer`, `RiskBadge` | Threat Campaign Clusters. Displays grouped adversary clusters sharing infrastructure across enterprise mailboxes (domains, reply-tos, bank accounts, attachment hashes). Includes search, severity filter pills, cluster cards, and a slide-out `CampaignDrawer` dossier listing linked case identifiers and containment recommendations. | Threat Intelligence Analysts and Security Leads tracking distributed adversary campaigns. |
| `/vendors` | [`src/routes/vendors.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/vendors.tsx) | `VendorsPage`, `VendorDetail`, `DirectoryOverview`, `VendorModal`, `TiltCard` | Trusted Vendor Identity Directory. Directory of authorized vendor baselines. Displays registered supplier profiles with approved email domains, contacts, approved bank account suffixes, normal recipients, and flagged behavioral anomalies. Includes a search bar, status filter (`all`, `trusted`, `watch`, `at_risk`), and creation/editing modals. | AP Supervisors, Procurement Administrators, and Security Compliance Admins. |
| `/settings` | [`src/routes/settings.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/settings.tsx) | `SettingsPage`, `PageHeader` | Enterprise Administration & Connectors. Multi-tenant overview displaying tenant ID, active user email/role, programmatic API key management (listing keys, generating new keys with instant copy-to-clipboard), mailbox connector status (M365 & Google Workspace sync tracking), and data privacy safeguards. | IT System Administrators and Security Infrastructure Engineers. |

---

## 2. The Core User Journey: Screen by Screen

A security analyst relies on SentinelMail to catch business email compromise (BEC), vendor impersonation, and payment diversion **before** treasury releases capital. Here is the operational workflow from detection to containment:

```
[ INBOUND EMAIL ] ──► Ingestion (M365/Gmail Webhook or Manual /analyze)
                             │
                             ▼
[ 1. DASHBOARD / ] ──► Alert Banner: "Action Needed Now" (e.g., SM-1037)
                             │
                             ▼
[ 2. QUEUE /cases ] ──► Filter "Pending Action" ──► Click Row ──► [ CasePeekDrawer ]
                             │                                         │
                             │ (Deep Dive Needed)                      │ (Quick Action)
                             ▼                                         ▼
[ 3. WORKSPACE /cases/$id ]                                    [ ActionModal ]
   ├── Behavioral Baseline Contrast (Known 1142 vs New 5518)           │
   ├── Timeline & Signals (Urgency score, SPF Pass, Reply-To hijack)   │
   ├── Vendor Trust Chain (VendorIdentityGraph)                        │
   ├── Campaign Correlation (CampaignGraph)                            │
   └── Relay Path (RelayPathForensics hop analysis)                    │
                             │                                         │
                             ▼                                         │
[ 4. DECISION EXECUTION ] ◄────────────────────────────────────────────┘
   ├── Click "Hold Payment" / "Escalate" / "Confirm Threat"
   ├── Check containment protocol (auto-appends ERP hold & callback note)
   └── Submit Mutation (POST /api/cases/:id/action)
                             │
                             ▼
[ 5. CONTAINMENT & POST-ACTION ]
   ├── Backend triggers sendContainmentAlert (Slack/Teams/Webhook)
   ├── React Query invalidates ["case", id] & ["cases"]
   └── Analyst clicks "Download Forensic Report" (GET /api/cases/:id/report PDF)
```

### Step 1: Alert Discovery & Queue Triage
1. **Entry**: The analyst lands on `/` ([`src/routes/index.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/index.tsx)).
   - The top banner shows current capital at risk (e.g., `$320,420 Protected`).
   - The **Featured Investigation** callout immediately flags the highest-scoring pending case (e.g. `SM-1037` with risk score `96/100`).
2. **Navigating to Queue**: The analyst clicks **"Investigations Queue"** in the sidebar or header, routing to `/cases` ([`src/routes/cases.index.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/cases.index.tsx)).
3. **Filtering**: The analyst clicks the preset filter chip **`Pending Action`** or **`Wire Fraud Lures`** in [`CasesFacetedFilterBar`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/CasesFacetedFilterBar.tsx). The table updates instantly (in-memory client filtering).

### Step 2: Rapid Triage via Case Peek Drawer
1. The analyst clicks any case row in [`CaseTable`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/CaseTable.tsx).
2. Without leaving `/cases`, [`CasePeekDrawer`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/CasePeekDrawer.tsx) slides out from the right:
   - Queries `api.getCase(caseId)` via `useQuery({ queryKey: ["case", caseId], enabled: Boolean(caseId && open) })`.
   - Displays threat severity (`Critical`), financial exposure (`$184,320.00 USD`), and the bank account comparison badge:
     `Unapproved Account: ••••5518 (Approved: ••••1142)`.
   - Analyst can paginate through cases in the queue using the Chevron left/right buttons (`handlePrev` / `handleNext`).
   - If clear-cut, the analyst can trigger an action directly from the drawer. If deeper evidence is needed, they click **"Open Full Investigation"** to route to `/cases/$caseId`.

### Step 3: Forensic Deep Dive on `/cases/$caseId`
On [`src/routes/cases.$caseId.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/cases.$caseId.tsx), the analyst reviews multi-layered forensic evidence:
1. **Executive Incident Command Header**: Shows case reference, subject, sender, target vendor, and automated recommendation banner:
   > *"Hold payment recommended — payment-change evidence requires out-of-band verification"*
2. **Behavioral Baseline Contrast** (`BehavioralBaselineContrast`): Directly contrasts:
   - *Normal Vendor Baseline*: Trusted domain `harborline-metals.com`, approved bank depository ending in `••••1142`, Net 30 payment terms, regular contact `ap@harborline-metals.com`.
   - *This Inbound Message*: Genuine mailbox used (SPF/DKIM pass), but depository switched to unapproved `••••5518`, urgent same-day wire demanded, and Reply-To diverted to external address `remit@harborline-finance.com`.
3. **Sliding Forensic Workspace Tabs**:
   - **Tab 1: Timeline & Signals**: View radial threat vector score distribution (`ThreatVectorDonut`), confidence level, authentication breakdown (SPF/DKIM/DMARC), and atomic indicators (URLs, domains, relay IPs, attachment SHA-256 hashes).
   - **Tab 2: Vendor Trust Chain**: View visual entity graph ([`VendorIdentityGraph.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/VendorIdentityGraph.tsx)) connecting sender, vendor identity, and unapproved bank account.
   - **Tab 3: Campaign Correlation**: View campaign cluster graph ([`CampaignGraph.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/CampaignGraph.tsx)) revealing if this unapproved bank account or lookalike domain was seen in other tenant inboxes.
   - **Tab 4: Relay Path & Raw Message**: Inspect the hop-by-hop SMTP path ([`RelayPathForensics.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/RelayPathForensics.tsx)) showing hostnames, ASNs, geolocations, and hop delay anomalies, alongside the sanitized message body preview (`BodyPreview`).

### Step 4: Containment Action Execution
1. The analyst clicks **"Hold Payment"** (or **"Escalate"** / **"Confirm Threat"** / **"Mark Safe"**).
2. The [`ActionModal`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/ActionModal.tsx) opens:
   - For payment hold or escalation actions, the modal provides an analyst note box and defaults to including the **Critical AP Containment Protocol**:
     ```text
     [CONTAINMENT PROTOCOL]: 
     1. ERP payment hold placed on voucher. 
     2. Out-of-band vendor telephone callback initiated (verified directory number). 
     3. Depository suffix ••••5518 added to enterprise blocklist across all banking rails.
     ```
3. Analyst confirms -> React Query executes mutation:
   `api.submitAction(caseId, { type: "hold_payment", note: finalNote })`
4. Request hits backend `POST /api/cases/:caseId/action`.

### Step 5: What Happens Next
1. **Frontend Reaction**:
   - Mutation succeeds; `toast.success("Hold Payment recorded")` fires.
   - React Query invalidates `["case", caseId]` and `["cases"]`.
   - The UI re-renders: decision badge updates from `pending` to `payment_held`.
   - The analyst clicks **"Download Forensic Report"** (`downloadReport`). The browser fetches the generated PDF via `api.downloadReport(caseId)` and triggers an instant file download: `SM-1037-report.pdf`.
2. **Backend Execution**:
   - Updates `cases.decision = 'payment_held'` and stores triage duration in minutes.
   - Records an immutable audit log entry in the `actions` table.
   - Because action is `hold_payment`, backend service `sendContainmentAlert()` dispatches urgent webhook alerts (Slack, Microsoft Teams, SMTP email) to Accounts Payable and SOC leadership.

---

## 3. How the Frontend Talks to the Backend

### The API Client Architecture

All HTTP communications are centralized in [`src/lib/api.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/api.ts).

* **Base URL**:
  ```ts
  export const API_BASE_URL =
    (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/$/, "") ?? "";
  ```
  In local development with Vite dev server proxying, `API_BASE_URL` defaults to an empty string `""` (relative paths hitting the dev server / API gateway).
* **Demo Mode Flag**:
  ```ts
  export const DEMO_MODE = String(import.meta.env["VITE_DEMO_MODE"] ?? "").toLowerCase() === "true";
  ```
  When `VITE_DEMO_MODE=true`, calls are intercepted by the local service adapter and served from [`src/lib/demo-data.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/demo-data.ts). In production or live mode (`VITE_DEMO_MODE=false`), real fetch requests are dispatched.

### How Authentication is Attached

Every request dispatched through `request<T>()` in [`src/lib/api.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/api.ts) (lines 43–55) applies authentication headers:

```ts
// 1. Check if Firebase has an active authenticated user
const token = firebaseAuth.currentUser ? await firebaseAuth.currentUser.getIdToken() : null;
const existingHeaders = new Headers(init?.headers);

if (token && !existingHeaders.has("Authorization")) {
  // Attached when signed in via Google SSO / Firebase Auth
  existingHeaders.set("Authorization", `Bearer ${token}`);
} else if (!existingHeaders.has("Authorization")) {
  // Dev / Unauthenticated fallback API key
  existingHeaders.set("Authorization", "Bearer sm_live_default_sentinel_corp_key_12345");
}

if (!existingHeaders.has("Accept")) {
  existingHeaders.set("Accept", "application/json");
}
```

#### Authentication Rules & Fallback Mechanics
1. **Production with Google SSO**: When an analyst signs in via Google on `/sign-in`, [`src/lib/google-auth.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/google-auth.ts) exchanges the Google credential with Firebase (`signInWithCredential`). `firebaseAuth.currentUser.getIdToken()` provides a real RS256 JWT, verified on the backend by Firebase Admin SDK in [`server/middleware/auth.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/server/middleware/auth.js).
2. **Local Dev / Demo Workspace**: When clicking **"Enter Demo Analyst Workspace"**, no Firebase session is created. The client attaches the default development key: `Bearer sm_live_default_sentinel_corp_key_12345`.
3. **Backend Dev Seeding**: In [`server/services/tenant.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/server/services/tenant.js) (lines 89–108), the backend explicitly pre-seeds `sm_live_default_sentinel_corp_key_12345` with admin privileges and binds it to `DEFAULT_ORG_ID` (`00000000-0000-0000-0000-000000000001`).

### Screen-by-Screen API Endpoint Mapping

The table below catalogs every endpoint called per screen, whether it hits live data or mock data, and flags any backend endpoints that are left uncalled:

| Screen / Component | Client Function | Method & Endpoint | Payload / Params | Live or Mock? | Flags & Code Citations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard** (`/`) | `api.listCases()` | `GET /api/cases` | None | **Live** (when `DEMO_MODE=false`) | Real endpoint. In demo mode returns `demoCaseSummaries`. |
| **Dashboard** (`/`) | `api.listCampaigns()` | `GET /api/campaigns` | None | **Live** (when `DEMO_MODE=false`) | Real endpoint. In demo mode returns `demoCampaigns`. |
| **Dashboard** (`/`) | `api.getCase()` | `GET /api/cases/:caseId` | `featured.id` | **Live** | Fetches reasons for the featured hero card. |
| **Dashboard** (`/`) | *None* | *None* | *None* | **MOCK / HARDCODED** | Top metrics contain fallback defaults if values are 0: `heldAmount \|\| 320420`, `critical.length \|\| 4`, `medianTriage ?? 1.4` ([`src/routes/index.tsx:L155`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/index.tsx#L155)). Mailbox card is static text. |
| **Cases** (`/cases`) | `api.listCases()` | `GET /api/cases` | None | **Live** | Real endpoint. Returns full case summary list. All faceted filtering is client-side in `useMemo`. |
| **Case Peek Drawer** | `api.getCase(id)` | `GET /api/cases/:caseId` | `caseId` | **Live** | Real endpoint. Fetches full case details on drawer open. |
| **Case Detail** (`/cases/$id`) | `api.getCase(id)` | `GET /api/cases/:caseId` | `caseId` | **Live** | Real endpoint. Note: In [`src/lib/api.ts:L195`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/api.ts#L195), if `DEMO_MODE=true` and ID matches a demo fixture (e.g. `c-1037`), returns local fixture. |
| **Case Detail** (`/cases/$id`) | `api.submitAction()` | `POST /api/cases/:caseId/action` | `{ type, note, analyst }` | **Live** | Real endpoint. Updates case decision and triggers backend alerts. |
| **Case Detail** (`/cases/$id`) | `api.downloadReport()` | `GET /api/cases/:caseId/report` | Header `Accept: application/pdf` | **Live** | Real endpoint. Returns binary PDF buffer generated by backend PDFKit service. |
| **Case Detail** (`/cases/$id`) | *Uncalled* | `GET /api/cases/:caseId/raw` | *None* | **UNEXPOSED** | **Backend exposes RFC822 raw EML download, but UI never calls or links to this endpoint!** |
| **Analyze** (`/analyze`) | `api.listVendors()` | `GET /api/vendors` | None | **Live** | Populates supplier dropdown baseline selector. |
| **Analyze** (`/analyze`) | `api.analyze()` | `POST /api/analyze` | `FormData(file, vendor_id)` | **Live** | Real multi-part upload endpoint. Returns `{ case_id, case }`. |
| **Analyze** (`/analyze`) | *Local Scenarios* | *None* | *None* | **MOCK PRESETS** | The 6 attack scenario `.eml` contents are hardcoded client-side string constants in [`src/routes/analyze.tsx:L115-328`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/analyze.tsx#L115-328). |
| **Campaigns** (`/campaigns`) | `api.listCampaigns()` | `GET /api/campaigns` | None | **Live** | Real endpoint. Returns campaign clusters. |
| **Campaigns** (`/campaigns`) | *Uncalled* | `GET /api/campaigns/:campaignId` | `campaignId` | **UNEXPOSED / GAP** | **Backend has `/:campaignId` to fetch linked case summaries, but UI never calls it!** Drawer displays bare IDs. |
| **Vendors** (`/vendors`) | `api.listVendors()` | `GET /api/vendors` | None | **Live** | Real endpoint. Lists all vendors for tenant. |
| **Vendors** (`/vendors`) | `api.createVendor()` | `POST /api/vendors` | Vendor profile JSON | **Live** | Real endpoint. Creates vendor in database. |
| **Vendors** (`/vendors`) | `api.updateVendor()` | `PUT /api/vendors/:vendorId` | Partial profile JSON | **Live** | Real endpoint. Updates vendor baseline in database. |
| **Vendors** (`/vendors`) | *Uncalled* | `GET /api/vendors/:vendorId` | `vendorId` | **UNEXPOSED** | Backend returns `related_case_ids`; UI never calls this endpoint. |
| **Vendors** (`/vendors`) | *Uncalled* | `DELETE /api/vendors/:vendorId` | `vendorId` | **UNEXPOSED** | **Backend supports DELETE; UI has no delete button or handler.** |
| **Settings** (`/settings`) | `api.getCurrentTenant()`| `GET /api/tenants/current` | None | **Live** | Returns `{ tenant, user }`. |
| **Settings** (`/settings`) | `api.listApiKeys()` | `GET /api/tenants/api-keys` | None | **Live** | Returns API key records. |
| **Settings** (`/settings`) | `api.createApiKey()` | `POST /api/tenants/api-keys` | `{ name, role }` | **Live** | Generates new API key and displays plaintext key. |
| **Settings** (`/settings`) | `api.listMailboxConnectors()` | `GET /api/ingest/connectors` | None | **Live** | Returns configured mailbox connectors. |
| **Settings** (`/settings`) | *Uncalled* | `POST /api/ingest/connectors` | Connector JSON | **UNEXPOSED** | `api.createMailboxConnector` exists in `api.ts`, but `settings.tsx` has no UI form/button for it. |
| **Settings** (`/settings`) | *Uncalled* | `GET /api/tenants/users`<br>`POST /api/tenants/users` | User JSON | **UNEXPOSED** | Backend supports team member listing & invite; UI has no team management section. |
| **Header** (`NotificationCenter`)| *None* | *None* | *None* | **100% MOCK** | Hardcoded in-memory state in [`src/components/AppShell.tsx:L378`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/AppShell.tsx#L378). No backend notification endpoint exists. |
| **Header** (`LiveTelemetryTicker`)| *None* | *None* | *None* | **100% MOCK** | Hardcoded ticker items in [`src/components/LiveTelemetryTicker.tsx:L12`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/LiveTelemetryTicker.tsx#L12). |

---

## 4. State Management

The application separates server-synced state from transient UI state:

### 1. Server State: TanStack Query (React Query v5)
Configured in [`src/router.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/router.tsx) with global defaults:
```ts
const queryClient = new QueryClient({
  defaultOptions: { 
    queries: { 
      retry: 1, 
      refetchOnWindowFocus: false 
    } 
  },
});
```

* **Query Keys**:
  * `["cases"]`: Case summaries list. Invalidated upon action execution in `cases.$caseId.tsx` and `CasePeekDrawer.tsx`.
  * `["case", caseId]`: Single case detail record. Invalidated upon action execution.
  * `["campaigns"]`: Threat campaign clusters.
  * `["vendors"]`: Registered vendor baselines. Invalidated upon vendor creation or update.
  * `["currentTenant"]`: Active organization and user identity.
  * `["apiKeys"]`: Organization API keys. Invalidated upon generating a new key.
  * `["connectors"]`: Mailbox ingestion connectors.

* **Cache Invalidation & Real-Time Sync**:
  * Mutations invoke `qc.invalidateQueries({ queryKey: [...] })` inside `onSuccess`.
  * **Note**: There is **no WebSocket or SSE listener** active on the frontend. Newly ingested webhook emails do not appear automatically in the UI without a manual page refresh, route navigation, or query refetch.

### 2. Transient UI State
Managed with standard React hooks (`useState`, `useRef`, `useMemo`):
* `CasesFacetedFilterBar`: Holds local `FilterState` (`q`, `severity`, `threat`, `decision`, `vendor`, `preset`). Filter evaluation is executed entirely in memory via `filtered = useMemo(...)` inside [`src/routes/cases.index.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/cases.index.tsx).
* `CasePeekDrawer`: Manages `selectedCaseId` and drawer `open` state.
* `SlidingTabBar`: Manages active forensic tab (`timeline`, `vendor`, `campaign`, `relay`) and animates sliding pill indicators.

### 3. Error Handling & Expired Auth Behavior
* **Network & Abort Errors**: In [`src/lib/api.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/api.ts), requests are wrapped in an `AbortController` with a 30-second timeout. If the backend times out, an `ApiError("Request timed out...", 408)` is thrown.
* **Inline Connection Notice**: If a query fails (`query.isError`), the UI renders the [`ConnectionNotice`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/AppShell.tsx) component:
  > *"Using local database baseline. <error.message>"* with a **"Retry Connection"** button (`query.refetch()`).
* **Uncaught Runtime Errors**: Handled by `ErrorComponent` in [`src/routes/__root.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/__root.tsx) displaying a "This page didn't load" panel with router invalidation and reset triggers.
* **Expired Auth**:
  * In Google/Firebase mode: Firebase SDK handles token refresh transparently when calling `firebaseAuth.currentUser.getIdToken()`.
  * If the session is invalid or revoked, the backend returns `401 Unauthorized`.
  * If unauthenticated, [`src/components/AppShell.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/AppShell.tsx#L67) redirects the user: `if (isConfigured && !user) return <Navigate to="/sign-in" />;`.

---

## 5. Vendor Management UI

Located in [`src/routes/vendors.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/vendors.tsx), the Vendor Directory is the zero-trust baseline that SentinelMail uses to flag hijacked supplier accounts.

### What an Admin Can Actually Do Today
1. **Browse & Search**: Filter registered suppliers by risk state (`all`, `trusted`, `watch`, `at_risk`) or search by supplier name, domain, contact email, or bank suffix.
2. **Inspect Baseline Details**: Selecting a vendor displays:
   * **Trusted Domains**: List of authorized email sender domains.
   * **Approved Billing Contacts**: List of authorized billing personnel.
   * **Approved Payee Account Suffixes**: Zero-trust bank account suffixes (e.g. `••••1142`).
   * **Normal Internal Recipients**: Internal AP and treasury mailboxes that normally receive invoices from this vendor.
   * **Flagged Behavioral Anomalies**: History of detected behavioral anomalies (e.g., *"Unseen Reply-To Destination"*, *"First-time urgency markers"*).
3. **Register New Vendor Profile**: Clicking **"Register Supplier Profile"** opens [`VendorModal`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/vendors.tsx#L618). Submitting triggers `POST /api/vendors`.
4. **Edit Vendor Profile**: Clicking **"Edit Baseline"** opens `VendorModal` populated with initial values. Submitting triggers `PUT /api/vendors/:vendorId`.

### What the Backend Supports vs. What the UI Exposes

```
Backend Capabilities (server/routes/vendors.ts)
├── GET    /api/vendors              ──► [EXPOSED] Used in VendorsPage list
├── GET    /api/vendors/:id          ──► [NOT EXPOSED] Queries related_case_ids
├── POST   /api/vendors              ──► [EXPOSED] Used in VendorModal (Create)
├── PUT    /api/vendors/:id          ──► [EXPOSED] Used in VendorModal (Edit)
└── DELETE /api/vendors/:id          ──► [NOT EXPOSED] Admin delete route exists, no UI button!
```

1. **Vendor Deletion (`DELETE /api/vendors/:vendorId`)**:
   * *Backend*: Fully implemented in [`server/routes/vendors.ts:L168`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/vendors.ts#L168) with role guard `requireRole(["admin"])`.
   * *UI*: Completely absent. There is no delete button, confirmation modal, or mutation in `src/routes/vendors.tsx` or `src/lib/api.ts`.
2. **Vendor-Related Case History (`GET /api/vendors/:vendorId`)**:
   * *Backend*: [`server/routes/vendors.ts:L51`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/vendors.ts#L51) performs a join query returning `related_case_ids` for that vendor.
   * *UI*: Uncalled. The UI selects vendor objects directly from the local `vendors` list returned by `GET /api/vendors`. As a result, related case links are never displayed on the vendor card.
3. **Manual Risk State Overrides**:
   * *Backend*: Supports updating `risk_state` (`trusted`, `watch`, `at_risk`).
   * *UI*: Displays the badge, but `VendorModal` has no input or dropdown to allow an admin to manually move a vendor between trusted and watchlist states.
4. **Normal Recipients Configuration**:
   * *Backend*: Schema contains `normal_recipients text[]`.
   * *UI*: `VendorModal` omits the input field for `normal_recipients`, defaulting to `initialVendor?.normal_recipients ?? []` on save.
5. **Anomaly Resolution / Acknowledgment**:
   * *Backend*: Stores anomalies array on the vendor record.
   * *UI*: Displays anomalies under "Flagged Behavioral Anomalies", but provides no button to clear, resolve, or mark anomalies as reviewed.

---

## 6. Settings & Administration UI Audit

Located in [`src/routes/settings.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/settings.tsx). Direct inspection of the code reveals what is connected to real backend endpoints versus what is placeholder:

### Direct Code Audit Results

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             SETTINGS AUDIT                               │
├──────────────────────────────┬──────────────┬────────────────────────────┤
│ Feature Section              │ Status       │ Backend Endpoint / Reality │
├──────────────────────────────┼──────────────┼────────────────────────────┤
│ Tenant Organization Card     │ PARTIAL REAL │ GET /api/tenants/current   │
│ - Name, ID, User Role        │ REAL         │ Real DB/MemoryStore data   │
│ - "Autonomous Policy"        │ PLACEHOLDER  │ Static text (Line 123)     │
│ - "SOC 2 Isolated" Badge     │ PLACEHOLDER  │ Static CSS badge           │
├──────────────────────────────┼──────────────┼────────────────────────────┤
│ Programmatic API Keys        │ REAL         │ GET/POST /api/tenants/api- │
│ - Key List & Prefix Display  │ REAL         │ GET /api/tenants/api-keys  │
│ - Generate Key Form          │ REAL         │ POST /api/tenants/api-keys │
│ - Fallback Key Display       │ HARDCODED    │ "sm_live_948f..." fallback │
├──────────────────────────────┼──────────────┼────────────────────────────┤
│ Mailbox Gateways             │ READ-ONLY    │ GET /api/ingest/connectors │
│ - Connector List & Status    │ REAL         │ Returns M365 & Google rows │
│ - "Register Connector" Form  │ MISSING UI   │ Backend has POST route;    │
│                              │              │ UI has no button/form!     │
├──────────────────────────────┼──────────────┼────────────────────────────┤
│ Team / User RBAC Management  │ COMPLETELY   │ Backend has /api/tenants/  │
│                              │ MISSING      │ users; UI has zero code.   │
├──────────────────────────────┼──────────────┼────────────────────────────┤
│ Data Privacy Safeguards Card │ 100% STATIC  │ Hardcoded documentation    │
└──────────────────────────────┴──────────────┴────────────────────────────┘
```

1. **Tenant Organization Card**:
   * **Real Data**: Queries `api.getCurrentTenant()` (`GET /api/tenants/current`). Displays actual database values for `tenantName`, `tenantId`, `userEmail`, and `userRole`.
   * **Static Content**: Line 123 displays `<dd>Auto-hold risk &ge; 70 enabled</dd>`—this threshold is hardcoded static text and not synced from tenant policy settings.
2. **API Keys Card**:
   * **Real Data**: Queries `api.listApiKeys()` (`GET /api/tenants/api-keys`). Allows creating new keys via `POST /api/tenants/api-keys`. The generated raw secret is displayed once with a functional clipboard copy helper.
   * **Hardcoded Fallback**: If no keys exist, line 78 falls back to rendering a hardcoded static dummy key `defaultKeyStr = "sm_live_948f219b48c04e229e3a628d05"`.
3. **Mailbox Gateways Card**:
   * **Real Data**: Queries `api.listMailboxConnectors()` (`GET /api/ingest/connectors`). Accurately displays active connectors (`conn-m365-default`, `conn-google-default`), synced message counts, and webhook URLs.
   * **Missing Creation UI**: In [`server/routes/ingest.js:L167`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/ingest.js#L167), the backend exposes `POST /api/ingest/connectors`, and [`src/lib/api.ts:L436`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/api.ts#L436) implements `api.createMailboxConnector()`. However, `settings.tsx` provides **no button, modal, or form** to register a new connector!
4. **Data Privacy & Forensic Safeguards**:
   * **Static Content**: Lines 297–322 render purely static compliance bullets regarding row-level boundaries, plain-text sanitization, and SHA-256 attachment handling.

---

## 7. Known Gaps: Frontend/Backend Mismatches

An honest, direct inventory of discrepancies, missing UI, and architectural gaps observed between `src/` and `server/`:

### 1. Unexposed Raw RFC-822 EML Download
* **Backend**: Exposes `GET /api/cases/:caseId/raw` ([`server/routes/cases.ts:L119`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/cases.ts#L119)) returning the exact RFC-822 email buffer with `Content-Type: message/rfc822`.
* **Frontend**: The API client has no method for this, and neither [`CaseDetail`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/cases.$caseId.tsx) nor [`RelayPathForensics`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/RelayPathForensics.tsx) renders a "Download Original .EML" button. Only the rendered PDF report is downloadable.

### 2. Campaign Cluster Case List Desynchronization
* **Backend**: Exposes `GET /api/campaigns/:campaignId` ([`server/routes/campaigns.ts:L41`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/campaigns.ts#L41)), which queries and embeds rich case summaries (`id`, `case_number`, `subject`, `severity`, `risk_score`). The generic `GET /api/campaigns` only returns string arrays of `case_ids`.
* **Frontend**: [`src/routes/campaigns.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/campaigns.tsx) only calls `api.listCampaigns()`. When an analyst opens `CampaignDrawer`, it reuses the campaign object from `listCampaigns()`. Because `campaign.cases` is not populated by the list endpoint, the drawer falls back to rendering raw ID strings instead of interactive case rows.

### 3. Missing Vendor Delete Action
* **Backend**: Provides `DELETE /api/vendors/:vendorId` ([`server/routes/vendors.ts:L168`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/vendors.ts#L168)) with `requireRole(["admin"])`.
* **Frontend**: `api.ts` lacks a `deleteVendor` method and `src/routes/vendors.tsx` has no delete action. Vendors cannot be deleted from the interface.

### 4. Client-Side Filtering with No Pagination
* **Backend**: `GET /api/cases` returns all cases for a tenant ordered by date without pagination parameters (`limit`, `offset`, `cursor`).
* **Frontend**: [`src/routes/cases.index.tsx`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/routes/cases.index.tsx) loads the entire case table into browser memory and evaluates search and faceted filters client-side in a `useMemo`. In large enterprise deployments with tens of thousands of ingested emails, this will degrade browser performance.

### 5. Mocked Notification Center & Telemetry Ticker
* **Frontend**:
  * [`NotificationCenter`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/AppShell.tsx#L400) uses in-memory mock alerts (`DEFAULT_NOTIFICATIONS`).
  * [`LiveTelemetryTicker`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/components/LiveTelemetryTicker.tsx) uses hardcoded static items.
* **Backend**: No `/api/notifications` or real-time event stream exists.

### 6. Missing Team / User RBAC Interface
* **Backend**: [`server/routes/tenants.js`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/server/routes/tenants.js) provides:
  * `GET /api/tenants/users` (`requireRole(["admin", "auditor"])`)
  * `POST /api/tenants/users` (`requireRole(["admin"])`)
* **Frontend**: There is no screen or modal in `src/routes/settings.tsx` to list organization members or invite team analysts.

### 7. Dual Demo Fixture Traps
* In [`src/lib/api.ts`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20%282%29/Sentinel-Mail-updated/Sentinel-Mail-main/src/lib/api.ts):
  * When `DEMO_MODE=true`, `api.getCase()` intercepts IDs present in `demoCases` (`c-1037`, `c-1042`, etc.) and serves mock data without hitting the network.
  * When analyzing custom `.eml` files, it falls through to the real `/api/analyze` endpoint.
  * **Tip for New Engineers**: Ensure `VITE_DEMO_MODE=false` in your `.env` when debugging live backend changes, otherwise actions on sample cases will bypass the database.

---

## 8. Directory & Key File Reference

Quick navigation index for frontend files:

```
src/
├── auth/
│   └── AuthProvider.tsx         # Firebase auth session provider & useAuth hook
├── components/
│   ├── ActionModal.tsx          # Containment decision modal (Hold, Escalate, Safe)
│   ├── AppShell.tsx             # Global sidebar, topbar, CommandPalette, NotificationCenter
│   ├── BehavioralBaselineContrast.tsx # Side-by-side known vendor vs inbound message comparison
│   ├── CampaignGraph.tsx        # Interactive campaign cluster node graph
│   ├── CasePeekDrawer.tsx       # Rapid triage slide-over panel on /cases
│   ├── CaseTable.tsx            # High-density data table for investigations
│   ├── CasesFacetedFilterBar.tsx# Preset chips & multi-facet dropdown filter toolbar
│   ├── CommandPalette.tsx       # Quick navigation (Ctrl+K / Cmd+K)
│   ├── RelayPathForensics.tsx   # SMTP hop-by-hop latency and geolocation forensics
│   ├── RiskBadge.tsx            # Severity badges and status pills
│   ├── RiskGauge.tsx            # SVG risk score meter (0-100)
│   ├── ThreatVectorDonut.tsx    # Multi-signal radial threat vector chart
│   ├── VendorHoverCard.tsx      # Rich hover tooltips for vendors & bank suffixes
│   └── VendorIdentityGraph.tsx  # Interactive vendor relationship visualizer
├── lib/
│   ├── api.ts                   # Central API client, demo mode toggle, auth headers
│   ├── demo-data.ts             # Static fixtures for demo mode
│   ├── firebase.ts              # Firebase client initialization
│   ├── format.ts                # Date, currency, and threat classification formatters
│   └── google-auth.ts           # Google Identity Services button & credential exchange
├── routes/
│   ├── __root.tsx               # Root route, QueryClientProvider, ThemeProvider, Toaster
│   ├── analyze.tsx              # /analyze — Ingestion dropzone & attack simulation lab
│   ├── campaigns.tsx            # /campaigns — Campaign clusters & dossier drawer
│   ├── cases.$caseId.tsx        # /cases/:caseId — Forensic investigation workspace
│   ├── cases.index.tsx          # /cases — Investigations queue & faceted filters
│   ├── index.tsx                # / — Security overview dashboard
│   ├── settings.tsx             # /settings — Multi-tenant keys & connectors
│   ├── sign-in.tsx              # /sign-in — Google SSO & Demo login
│   └── vendors.tsx              # /vendors — Trusted vendor baseline directory
├── router.tsx                   # TanStack Router instance & QueryClient config
└── types/
    └── sentinel.ts              # Core TypeScript definitions (Case, Vendor, Campaign, Evidence)
```
