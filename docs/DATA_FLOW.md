# SentinelMail Data Flow Trace

This document traces the actual end-to-end data flow when a user uploads an `.eml` file for analysis, reflecting the currently implemented in-memory backend.

## Flow: EML Upload & Analysis

1. **User Action**: The user drops an `.eml` file into the dropzone on the `analyze.tsx` page.
2. **Frontend Submission**: 
   - `analyze.tsx` creates a `FormData` object containing the file and an optional `vendor_id`.
   - It calls `api.analyze(file, vendorId)` from `src/lib/api.ts`.
3. **API Request**:
   - `api.ts` makes a `POST` request to `/api/analyze` using `fetch`.
   - If `DEMO_MODE` is true, it bypasses the network, sleeps for ~2.4s, performs naive string matching on the file name/header to pick a matching `demoCase`, and returns it immediately.
4. **Server Interception**:
   - In standard execution, `src/server.ts` intercepts the `/api/analyze` request.
   - It attempts to forward it to `http://localhost:3001` (the missing Express backend).
   - This `fetch` fails (connection refused), so the `catch` block invokes `handleLocalApi(request)` from `src/lib/local-api.server.ts`.
5. **In-Memory Backend Handling**:
   - `local-api.server.ts` handles the `POST /analyze` route.
   - It reads the `.eml` file bytes into a `Uint8Array`.
   - It invokes `analyzeEml(...)` from `src/lib/eml-analysis.server.ts`.
6. **EML Parsing & "Analysis"**:
   - `eml-analysis.server.ts` reads the raw bytes, converting them to a UTF-8 string.
   - It uses Regex to parse `From:`, `To:`, `Subject:`, and `Date:` headers.
   - It performs rudimentary text extraction (finding boundaries for multipart/alternative boundaries).
   - Instead of using OpenAI (as planned/documented in previous architectures), it relies on static heuristic checks:
     - Checks if the domain is known/trusted.
     - Checks if the subject contains keywords like "invoice", "urgent", "wire", "password".
     - Hardcodes mock severity (`critical`, `medium`, `safe`), mock risks (e.g. `ceo_impersonation`), and a static timeline of forensic events based on these keywords.
   - It returns a synthesized `Case` object.
7. **Storage**:
   - `local-api.server.ts` saves the synthesized `Case` into its in-memory `cases` `Map`.
8. **Response to Client**:
   - The route returns `HTTP 201 Created` with `{ case_id, case }`.
9. **UI Rendering**:
   - `analyze.tsx` receives the response.
   - It triggers a TanStack Router navigation to `/cases/$caseId`.
   - The `/cases/$caseId` route fetches the case via `api.getCase(id)` and renders the evidence cards and timeline.
