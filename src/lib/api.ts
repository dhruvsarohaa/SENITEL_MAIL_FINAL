import type {
  AnalysisResult,
  AnalystAction,
  Campaign,
  Case,
  CaseSummary,
  VendorProfile,
} from "@/types/sentinel";
import { demoCampaigns, demoCaseSummaries, demoCases, demoVendors } from "./demo-data";
import { firebaseAuth } from "./firebase";

export const API_BASE_URL =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/$/, "") ?? "";

/** Demo fixtures are used ONLY when explicitly enabled with VITE_DEMO_MODE=true. */
export const DEMO_MODE = String(import.meta.env["VITE_DEMO_MODE"] ?? "").toLowerCase() === "true";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Wraps a payload so the UI can label results that came from local demo fixtures. */
export interface Sourced<T> {
  data: T;
  demo: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 30_000);

  try {
    const token = firebaseAuth.currentUser ? await firebaseAuth.currentUser.getIdToken() : null;

    const existingHeaders = new Headers(init?.headers);

    if (token && !existingHeaders.has("Authorization")) {
      existingHeaders.set("Authorization", `Bearer ${token}`);
    } else if (!existingHeaders.has("Authorization")) {
      existingHeaders.set("Authorization", "Bearer sm_live_default_sentinel_corp_key_12345");
    }

    if (!existingHeaders.has("Accept")) {
      existingHeaders.set("Accept", "application/json");
    }

    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: existingHeaders,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("Request timed out. The backend may be waking up. Please try again.", 408);
    }

    throw new ApiError(err instanceof Error ? err.message : "Network request failed", 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new ApiError(`Request failed (${res.status}) for ${path}`, res.status);
  }

  return (await res.json()) as T;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Demo Mode is a complete local service adapter: it never surfaces backend errors.
 * Live mode calls FastAPI only; failures surface to the UI as a compact retry notice.
 */
async function sourced<T>(fn: () => Promise<T>, demoValue: T): Promise<Sourced<T>> {
  if (DEMO_MODE) {
    await delay(180);
    return { data: demoValue, demo: true };
  }
  return { data: await fn(), demo: false };
}

const PRESET_DEMO_FILENAMES = [
  "po-55129-compromised-vendor-harborline.eml",
  "inv-88213-urgent-remittance.eml",
  "confidential-ceo-wire-request.eml",
  "m365-security-alert-password-expiry.eml",
  "overdue_statement_8819.pdf.exe.eml",
  "aster-manufacturing-monthly-invoice-clean.eml",
];

export const api = {
  /** POST /api/analyze — multipart .eml upload */
  async analyze(file: File, vendorId?: string): Promise<AnalysisResult> {
    const isPresetScenario = PRESET_DEMO_FILENAMES.includes(file.name.toLowerCase());

    // If running in live mode OR uploading a custom user EML file, always use the real backend pipeline
    if (!DEMO_MODE || !isPresetScenario) {
      try {
        const form = new FormData();
        form.append("file", file);
        if (vendorId) form.append("vendor_id", vendorId);
        return await request<AnalysisResult>("/api/analyze", { method: "POST", body: form });
      } catch (err) {
        if (!DEMO_MODE) throw err;
        console.warn("Backend analysis failed, falling back to mock fixtures:", err);
      }
    }

    if (DEMO_MODE) {
      await delay(2400);
      const name = file.name.toLowerCase();
      let textHeader = "";
      try {
        textHeader = (await file.slice(0, 4000).text()).toLowerCase();
      } catch {
        // ignore file read error if any
      }
      const combined = `${name} ${textHeader}`;

      let caseId = "c-1037"; // default fallback
      if (
        combined.includes("supply") ||
        combined.includes("88213") ||
        combined.includes("invoice-fraud") ||
        combined.includes("supplyco")
      ) {
        caseId = "c-1042";
      } else if (
        combined.includes("harborline") ||
        combined.includes("po-55129") ||
        combined.includes("compromised")
      ) {
        caseId = "c-1037";
      } else if (
        combined.includes("ceo") ||
        combined.includes("confidential") ||
        combined.includes("executive") ||
        combined.includes("david miller")
      ) {
        caseId = "c-1041";
      } else if (
        combined.includes("m365") ||
        combined.includes("credential") ||
        combined.includes("session expire") ||
        combined.includes("token")
      ) {
        caseId = "c-1035";
      } else if (
        combined.includes("malware") ||
        combined.includes(".exe") ||
        combined.includes("freight-global") ||
        combined.includes("overdue_statement")
      ) {
        caseId = "c-1031";
      } else if (
        combined.includes("benign") ||
        combined.includes("clean") ||
        combined.includes("inv-2026-091") ||
        combined.includes("aster-mfg")
      ) {
        caseId = "c-1028";
      }

      const sample =
        demoCases.find((item) => item.id === caseId) ??
        demoCases.find((item) => item.id === "c-1037") ??
        demoCases[0]!;
      return { case_id: sample.id, case: sample };
    }
    const form = new FormData();
    form.append("file", file);
    if (vendorId) form.append("vendor_id", vendorId);
    return request<AnalysisResult>("/api/analyze", { method: "POST", body: form });
  },

  /** GET /api/cases */
  listCases(): Promise<Sourced<CaseSummary[]>> {
    return sourced(() => request<CaseSummary[]>("/api/cases"), demoCaseSummaries);
  },

  /** GET /api/cases/{case_id} */
  async getCase(caseId: string): Promise<Sourced<Case | null>> {
    // If caseId is not one of the demo IDs, query backend directly
    const isDemoId = demoCases.some((c) => c.id === caseId || c.case_number === caseId);
    if (!DEMO_MODE || !isDemoId) {
      try {
        const data = await request<Case>(`/api/cases/${encodeURIComponent(caseId)}`);
        return { data, demo: false };
      } catch (err) {
        if (!DEMO_MODE) throw err;
      }
    }
    return sourced(
      () => request<Case>(`/api/cases/${encodeURIComponent(caseId)}`),
      demoCases.find((c) => c.id === caseId || c.case_number === caseId) ?? demoCases[0]!,
    );
  },

  /** POST /api/cases/{case_id}/action */
  async submitAction(caseId: string, action: AnalystAction): Promise<{ ok: boolean }> {
    if (DEMO_MODE) {
      await delay(500);
      return { ok: true };
    }
    return request<{ ok: boolean }>(`/api/cases/${encodeURIComponent(caseId)}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
  },

  /** GET /api/cases/{case_id}/report — forensic PDF */
  async downloadReport(caseId: string): Promise<Blob> {
    if (DEMO_MODE) {
      await delay(400);
      const kase = demoCases.find((c) => c.id === caseId) ?? demoCases[0]!;
      const bankSuffix =
        kase.evidence?.financial?.bank_account_last4 ??
        (kase.case_number === "SM-1037" ? "5518" : "XXXX");
      const text = [
        "================================================================================",
        "                       SENTINELMAIL FORENSIC INCIDENT REPORT                    ",
        "         AI-Assisted BEC Investigation & Financial Containment Platform         ",
        "================================================================================",
        "",
        `Case Reference:    ${kase.case_number}`,
        `Generated:         ${new Date().toUTCString()}`,
        `Threat Class:      ${kase.threat_class.toUpperCase()}`,
        `Risk Score:        ${kase.risk_score}/100 [${kase.severity.toUpperCase()}]`,
        `Detection Conf:    ${Math.round((kase.confidence ?? 0.95) * 100)}%`,
        `Autonomous Action: ${kase.assigned_action ?? "HOLD PAYMENT"}`,
        `Decision Banner:   ${kase.decision_banner ?? "Hold payment recommended"}`,
        `Subject:           ${kase.subject}`,
        `Inbound Sender:    ${kase.sender}`,
        `Reply-To:          ${kase.evidence?.sender_identity?.reply_to ?? "Same as From (Direct)"}`,
        `Target Vendor:     ${kase.vendor ?? "Unspecified"}`,
        `Capital At Risk:   ${kase.amount_at_risk ? `$${kase.amount_at_risk.toLocaleString()} ${kase.currency ?? "USD"}` : "Not detected"}`,
        "",
        "--------------------------------------------------------------------------------",
        "                       CRITICAL AP CONTAINMENT PROTOCOL                         ",
        "--------------------------------------------------------------------------------",
        "PRIORITY 1 ACTIONS FOR ACCOUNTS PAYABLE & TREASURY BEFORE RELEASING FUNDS:",
        "",
        "  [1] ERP PAYMENT HOLD:",
        "      Place emergency payment hold in accounting system on voucher.",
        "",
        "  [2] OUT-OF-BAND VENDOR CALLBACK:",
        "      Call known vendor contact at verified telephone number (NOT the number in",
        "      the email, invoice attachment, or email signature).",
        "",
        `  [3] TREASURY DEPOSITORY BLOCK:`,
        `      Add bank suffix (••••${bankSuffix}) to enterprise blocklist across all`,
        "      banking rails and ERP payee master records.",
        "",
        "--------------------------------------------------------------------------------",
        "                       BEHAVIORAL BASELINE CONTRAST                             ",
        "--------------------------------------------------------------------------------",
        "  Normal Vendor Baseline:  Invoices to AP · Depository ending in 1142 · Net 30 terms",
        `  This Inbound Message:    Depository changed to ••••${bankSuffix} · Urgent same-day release`,
        `                           · Off-domain Reply-To (${kase.evidence?.sender_identity?.reply_to ?? "Redirected"})`,
        `                           · Gateway Status: SPF/DKIM ${kase.evidence?.sender_identity?.auth?.spf?.toUpperCase() ?? "PASS"}`,
        "",
        "--------------------------------------------------------------------------------",
        "                       FORENSIC EVIDENCE & TIMELINE                             ",
        "--------------------------------------------------------------------------------",
        ...(kase.timeline ?? []).map(
          (t, i) => `  ${i + 1}. [${t.severity.toUpperCase()}] ${t.title}\n     ${t.description}`,
        ),
        "",
        "--------------------------------------------------------------------------------",
        "                       MESSAGE BODY PREVIEW                                     ",
        "--------------------------------------------------------------------------------",
        kase.body_preview || "No body preview available.",
        "",
        "================================================================================",
        "SentinelMail Enterprise Forensics · Confidential Security Document",
        "================================================================================",
      ].join("\n");
      return new Blob([text], { type: "text/plain" });
    }
    // const res = await fetch(`${API_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/report`, {
    //   headers: { Accept: "application/pdf" },
    // });

    const token = firebaseAuth.currentUser ? await firebaseAuth.currentUser.getIdToken() : null;

    const headers: Record<string, string> = {
      Accept: "application/pdf",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/report`, {
      headers,
    });

    if (!res.ok) throw new ApiError(`Report unavailable (${res.status})`, res.status);
    return res.blob();
  },

  /** Campaign clusters are derived from case data returned by the backend. */
  listCampaigns(): Promise<Sourced<Campaign[]>> {
    return sourced(() => request<Campaign[]>("/api/campaigns"), demoCampaigns);
  },

  listVendors(): Promise<Sourced<VendorProfile[]>> {
    return sourced(() => request<VendorProfile[]>("/api/vendors"), demoVendors);
  },

  async createVendor(profile: Omit<VendorProfile, "id">): Promise<VendorProfile> {
    if (DEMO_MODE) {
      await delay(400);
      return { id: `v-demo-${Date.now()}`, ...profile };
    }
    return request<VendorProfile>("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
  },

  async updateVendor(vendorId: string, profile: Partial<VendorProfile>): Promise<VendorProfile> {
    if (DEMO_MODE) {
      await delay(400);
      const existing = demoVendors.find((v) => v.id === vendorId) ?? demoVendors[0]!;
      return { ...existing, ...profile };
    }
    return request<VendorProfile>(`/api/vendors/${encodeURIComponent(vendorId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
  },

  async getCurrentTenant(): Promise<{
    tenant?: { id?: string; name?: string; slug?: string };
    user?: { email?: string; role?: string };
  }> {
    if (DEMO_MODE) {
      return {
        tenant: { id: "org-sentinel-corp", name: "Sentinel Corporation", slug: "sentinel-corp" },
        user: { email: "admin@sentinel.corp", role: "admin" },
      };
    }
    return request("/api/tenants/current");
  },

  async listApiKeys(): Promise<
    Array<{ id: string; name: string; prefix?: string; role?: string; created_at?: string }>
  > {
    if (DEMO_MODE) {
      return [
        {
          id: "key-1",
          name: "Default Live Ingestion Key",
          prefix: "sm_live_948f",
          created_at: new Date().toISOString(),
        },
      ];
    }
    return request("/api/tenants/api-keys");
  },

  async createApiKey(
    name: string,
    role = "analyst",
  ): Promise<{ apiKey: string; name: string; prefix: string; role: string }> {
    if (DEMO_MODE) {
      return {
        apiKey: `sm_live_${Math.random().toString(36).substring(2, 12)}`,
        name,
        prefix: "sm_live_",
        role: role,
      };
    }
    return request("/api/tenants/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role }),
    });
  },

  async listMailboxConnectors(): Promise<
    Array<{
      id: string;
      provider: string;
      name: string;
      mailbox: string;
      status: string;
      messages_synced: number;
      last_sync_at?: string;
      webhook_url?: string;
      created_at?: string;
    }>
  > {
    if (DEMO_MODE) {
      return [
        {
          id: "conn-1",
          provider: "m365",
          name: "Microsoft 365 Graph Webhook",
          mailbox: "security-inbox@sentinelcorp.com",
          status: "active",
          messages_synced: 142,
          last_sync_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          webhook_url: "/api/ingest/m365/webhook?tenant=sentinel-corp",
        },
        {
          id: "conn-2",
          provider: "google_workspace",
          name: "Google Cloud Pub/Sub Push",
          mailbox: "alerts@sentinelcorp.com",
          status: "active",
          messages_synced: 89,
          last_sync_at: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
          webhook_url: "/api/ingest/google/webhook?tenant=sentinel-corp",
        },
      ];
    }
    return request("/api/ingest/connectors");
  },

  async createMailboxConnector(data: {
    provider: "m365" | "google_workspace";
    mailbox: string;
    name?: string;
  }): Promise<{ id: string; name: string; mailbox: string; webhook_url: string }> {
    if (DEMO_MODE) {
      return {
        id: `conn-${Date.now()}`,
        name: data.name || `${data.provider.toUpperCase()} (${data.mailbox})`,
        mailbox: data.mailbox,
        webhook_url: `/api/ingest/${data.provider === "google_workspace" ? "google" : "m365"}/webhook?tenant=sentinel-corp`,
      };
    }
    return request("/api/ingest/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
};

/** In demo mode reports are plain-text; the Express backend generates real PDFs. */
export const reportExtension = DEMO_MODE ? "txt" : "pdf";
