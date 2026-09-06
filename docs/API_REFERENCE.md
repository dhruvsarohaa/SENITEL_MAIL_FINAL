# SentinelMail API Reference

This document catalogs the frontend `api` object methods exported from `src/lib/api.ts` and their corresponding backend routes handled by `src/lib/local-api.server.ts`.

> **Note on `Sourced<T>`**: Many API responses are wrapped in `Sourced<T>`, which provides `{ data: T, demo: boolean }`. If the backend call times out (6s limit), the API graceful-fails and returns static fixture data from `demo-data.ts`, setting `demo: true`.

---

## 1. `api.analyze(file: File, vendorId?: string)`
Uploads an EML file for threat analysis.

- **Frontend Logic**: Wraps the file in a `FormData` object. If `DEMO_MODE` is enabled, performs local regex keyword matching on the filename/header and returns a mocked response.
- **Backend Route**: `POST /api/analyze`
- **Backend Implementation**: `local-api.server.ts` parses the `FormData`, reads the bytes, and passes them to `analyzeEml()` which performs static Regex analysis and returns a constructed `Case`.
- **Returns**: `Promise<AnalysisResult>` (`{ case_id: string, case: Case }`).

---

## 2. `api.listCases()`
Fetches all case summaries for the dashboard and list views.

- **Backend Route**: `GET /api/cases`
- **Backend Implementation**: `local-api.server.ts` returns the values of the in-memory `cases` Map, sorted by `created_at` descending, with full-body evidence fields stripped.
- **Returns**: `Promise<Sourced<CaseSummary[]>>`.

---

## 3. `api.getCase(caseId: string)`
Fetches the full details (timeline, evidence, body preview) for a specific case.

- **Backend Route**: `GET /api/cases/:caseId`
- **Backend Implementation**: Retrieves the case from the in-memory Map.
- **Returns**: `Promise<Sourced<Case | null>>`.

---

## 4. `api.submitAction(caseId: string, action: AnalystAction)`
Submits a user decision (e.g. hold payment, mark safe, escalate) on a case.

- **Backend Route**: `POST /api/cases/:caseId/action`
- **Backend Implementation**: Appends the action to the case's `actions` array and updates the case's `decision` field (e.g., `hold_payment` -> `payment_held`).
- **Returns**: `Promise<{ ok: boolean }>`.

---

## 5. `api.downloadReport(caseId: string)`
Generates a forensic PDF report for a given case.

- **Backend Route**: `GET /api/cases/:caseId/report`
- **Backend Implementation**: The backend currently returns a `text/plain` string formatted like a text-based incident report. It does NOT generate a PDF despite `pdfkit` being installed.
- **Frontend Fallback**: If in `DEMO_MODE`, the frontend generates a similar plaintext Blob directly.
- **Returns**: `Promise<Blob>`.

---

## 6. `api.listCampaigns()`
Fetches aggregated threat campaigns.

- **Backend Route**: `GET /api/campaigns`
- **Backend Implementation**: Returns an empty array `[]`. There is NO backend logic to aggregate cases into campaigns currently.
- **Frontend Fallback**: Returns `demoCampaigns` if the backend times out or in demo mode.
- **Returns**: `Promise<Sourced<Campaign[]>>`.

---

## 7. `api.listVendors()`
Fetches the list of tracked vendors/suppliers.

- **Backend Route**: `GET /api/vendors`
- **Backend Implementation**: Returns the values of the in-memory `vendors` Map.
- **Returns**: `Promise<Sourced<VendorProfile[]>>`.

---

## 8. `api.createVendor(profile: Omit<VendorProfile, "id">)`
Registers a new vendor relationship.

- **Backend Route**: `POST /api/vendors`
- **Backend Implementation**: Assigns a UUID and stores the vendor in the in-memory Map.
- **Returns**: `Promise<VendorProfile>`.
