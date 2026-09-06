# SentinelMail Architecture Audit

**Disclaimer**: This document reflects the *actual, implemented state* of the codebase as of this audit, overriding any hypothetical or planned architectures described in past READMEs.

## 1. High-Level Overview

SentinelMail is a Business Email Compromise (BEC) investigation platform primarily targeting finance teams. It allows users to ingest `.eml` files, automatically analyzes them for threat signals (invoice fraud, CEO impersonation, etc.), and provides an interface for analysts to triage, hold payments, or mark as safe.

**Current Reality:** 
The application is currently implemented as a **Single Page Application (SPA) frontend with a mock/local in-memory API layer**. While the user may have requested backend generation (Express/PostgreSQL), the `server/` directory and PostgreSQL database layers are **not** present in the source tree. The application routes all API requests through Vite's Nitro server preset to `src/lib/local-api.server.ts`, which holds state in memory using Maps.

## 2. Tech Stack Verification

Based on `package.json`, `vite.config.ts`, and `tsconfig.json`:

- **Frontend Framework**: React 19 (`react`, `react-dom`)
- **Routing**: TanStack Router (`@tanstack/react-router`, `@tanstack/react-start`)
- **Build Tool**: Vite 8 (`vite`, `nitro`)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`), `clsx`, `tailwind-merge`
- **UI Components**: Radix UI primitives (`@radix-ui/react-*`), Framer Motion, Recharts
- **Data Fetching**: TanStack Query (`@tanstack/react-query`)
- **Language**: TypeScript (`ES2022` target, `ESNext` modules)

**Backend Stack (Actual):**
- In-memory Node.js endpoints inside `src/lib/local-api.server.ts`.
- `nitro` is configured in `vite.config.ts` to output a Node server (`node-server` preset).
- The `start` script runs `node .output/server/index.mjs`.
- **Note**: `express` and `pg` are listed in `package.json` dependencies, but they are completely unused in the codebase (no `server/` directory exists).

## 3. Data Flow & Execution Environment

1. **Frontend to API**: 
   - React components call functions exported from `src/lib/api.ts`.
   - `api.ts` makes `fetch` requests to `/api/*` endpoints.
   - It implements a `DEMO_MODE` fallback: if the backend request times out (after 6s) or is explicitly bypassed, it resolves with static fixtures from `src/lib/demo-data.ts`.

2. **API Routing**:
   - In production (via Nitro) and development, requests starting with `/api/` are caught by `src/server.ts`.
   - `src/server.ts` attempts to proxy `/api/*` to `http://localhost:3001` (presumably the intended Express server).
   - Because port 3001 is unavailable, it catches the network error and falls back to `handleLocalApi(request)` from `src/lib/local-api.server.ts`.

3. **In-Memory Backend**:
   - `src/lib/local-api.server.ts` handles the requests.
   - It maintains in-memory Maps for `cases` and `vendors`.
   - `.eml` uploads trigger `analyzeEml` (from `src/lib/eml-analysis.server.ts`), which parses headers and text natively, generating a mock risk analysis payload.

## 4. Key Limitations & Mocked Functionality

- **Database**: No persistent database exists. All analyzed cases and added vendors are lost when the Node server restarts.
- **Express Backend**: Missing. `server/index.ts`, Express routes, and DB connections do not exist.
- **Authentication**: `src/lib/google-auth.ts` uses Firebase Auth, but it's only client-side state. The backend does not verify tokens.
- **AI/LLM Integration**: `openai` is in `package.json`, but the actual email analysis (`eml-analysis.server.ts`) relies on naive string matching and regexes, not OpenAI API calls.
- **PDF Generation**: `pdfkit` is in `package.json`, but `api.ts` intercepts `/api/cases/:id/report` and generates a mock `.txt` file instead in DEMO mode.

## 5. Deployment Reality

The app is deployed on Render using the `node-server` preset of Nitro. The start command is `node .output/server/index.mjs`, which runs the TanStack Start SSR server combined with the in-memory `/api/` fallback. There is no separate backend service deployed.
