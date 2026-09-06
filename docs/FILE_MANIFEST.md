# SentinelMail File Manifest

A comprehensive list of files and their actual responsibilities in the SentinelMail codebase.

## Root Configuration
- `package.json`: Manages dependencies (React, Vite, TanStack Router/Query, Radix UI) and scripts. Mentions unused `express`, `pg`, `openai`, `pdfkit`.
- `vite.config.ts`: Configures Vite with Tailwind v4, TanStack Start, Nitro (`node-server` preset).
- `tsconfig.json`: TypeScript configuration targeting ES2022 and React JSX.
- `eslint.config.js` & `.prettierrc`: Linting and formatting rules.

## Source Directory (`src/`)

### Entry Points
- `src/start.ts` & `src/server.ts`: TanStack Start server/client entry points. `server.ts` intercepts `/api/` requests and proxies them to the local in-memory API fallback.
- `src/router.tsx`: Initializes the TanStack router instance and type-safe routing.
- `src/styles.css`: Global CSS and Tailwind directives.

### Routes (`src/routes/`)
- `__root.tsx`: The root application shell. Provides TanStack Query client, Theme Provider, Auth Provider, and global navigation/layout.
- `index.tsx`: Dashboard page displaying key metrics, the priority investigation queue, threat activity charts (Recharts), and latest active campaign.
- `analyze.tsx`: Page for dragging and dropping `.eml` files to trigger the analysis API.
- `cases.index.tsx`: List view of all parsed cases/investigations.
- `cases.$caseId.tsx`: Detail view for a specific case. Shows forensic evidence, timeline, and an interface to hold payments or mark safe.
- `campaigns.tsx`: Lists grouped threat campaigns (clusters of related cases).
- `vendors.tsx`: Vendor management directory. Displays trusted domains and bank account suffixes.
- `settings.tsx`: Basic user and workspace settings.
- `sign-in.tsx`: Authentication screen utilizing Google Auth.

### Library & Utilities (`src/lib/`)
- `api.ts`: Central network data fetcher for the frontend. Implements a 6-second timeout fallback to `demo-data.ts` if the true backend is unreachable.
- `demo-data.ts`: Hardcoded JSON fixtures used when the backend API fails or when `VITE_DEMO_MODE=true`.
- `local-api.server.ts`: The *actual* API implementation being used. Stores cases/vendors in `Map` instances in memory. Exposes `/cases`, `/vendors`, `/analyze`.
- `eml-analysis.server.ts`: Parses uploaded `.eml` files natively using regex and string matching to extract From/To headers, subjects, text bodies, and generate a mock risk score.
- `error-capture.ts` & `error-page.ts`: Custom error catching for SSR errors in TanStack Start.
- `google-auth.ts`: Initializes Firebase Auth for client-side authentication.
- `utils.ts` & `format.ts`: Helper functions for `tailwind-merge` (`cn`), date formatting, and currency display.

### Components (`src/components/`)
- `ui/`: Collection of reusable UI components based on Radix UI (Button, Dialog, Select, Table, Tabs, etc.).
- `AppShell.tsx`: Global layout wrapper including the navigation sidebar and mobile headers.
- `CaseTable.tsx` & `CasePeekDrawer.tsx`: Reusable data tables for displaying cases.
- `RiskBadge.tsx` & `RiskGauge.tsx`: Visual indicators for threat severity.
- `EvidenceCard.tsx` & `Timeline.tsx`: Detailed forensic display components used on the case detail page.
- `CampaignGraph.tsx`: Visual node-link diagram for threat campaigns (not fully integrated with real data).

### Types (`src/types/`)
- `sentinel.ts`: Global TypeScript definitions for `Case`, `VendorProfile`, `Campaign`, `Evidence`, `TimelineEntry`, and API responses.
