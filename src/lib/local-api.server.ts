import type { AnalystAction, Campaign, Case, VendorProfile } from "@/types/sentinel";
import { analyzeEml } from "./eml-analysis.server";

const cases = new Map<string, Case>();
const vendors = new Map<string, VendorProfile>();
let nextCaseNumber = 1042;

function json(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
}

function apiError(message: string, status: number) {
  return json({ message }, { status });
}

function caseSummaries() {
  return [...cases.values()]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .map(
      ({
        confidence: _confidence,
        decision_banner: _banner,
        recipients: _recipients,
        body_preview: _preview,
        evidence: _evidence,
        timeline: _timeline,
        relay_path: _relays,
        actions: _actions,
        campaign_graph: _graph,
        ...summary
      }) => summary,
    );
}

export async function handleLocalApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";

  if (request.method === "POST" && path === "/analyze") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("A .eml file is required.", 400);
    if (!file.name.toLowerCase().endsWith(".eml"))
      return apiError("Only .eml files are supported.", 400);
    const selectedVendor = form.get("vendor_id");
    try {
      const kase = await analyzeEml({
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
        vendors: [...vendors.values()],
        ...(typeof selectedVendor === "string" && selectedVendor
          ? { vendorId: selectedVendor }
          : {}),
        caseNumber: `SM-${nextCaseNumber++}`,
      });
      cases.set(kase.id, kase);
      return json({ case_id: kase.id, case: kase }, { status: 201 });
    } catch (cause) {
      return apiError(
        cause instanceof Error ? cause.message : "Unable to analyze this email.",
        422,
      );
    }
  }

  if (request.method === "GET" && path === "/cases") return json(caseSummaries());
  if (request.method === "GET" && path === "/campaigns") return json([] satisfies Campaign[]);
  if (request.method === "GET" && path === "/vendors") return json([...vendors.values()]);

  if (request.method === "POST" && path === "/vendors") {
    const profile = (await request.json()) as Omit<VendorProfile, "id">;
    const vendor = { ...profile, id: crypto.randomUUID() };
    vendors.set(vendor.id, vendor);
    return json(vendor, { status: 201 });
  }

  const match = path.match(/^\/cases\/([^/]+)(?:\/(action|report))?$/);
  if (!match) return apiError("API route not found.", 404);
  const kase = cases.get(decodeURIComponent(match[1]!));
  if (!kase) return apiError("Case not found.", 404);
  const operation = match[2];
  if (request.method === "GET" && !operation) return json(kase);

  if (request.method === "POST" && operation === "action") {
    const action = (await request.json()) as AnalystAction;
    kase.actions = [...(kase.actions ?? []), { ...action, created_at: new Date().toISOString() }];
    const decisions = {
      hold_payment: "payment_held",
      mark_safe: "safe",
      escalate: "escalated",
      confirm_threat: "confirmed_threat",
    } as const;
    kase.decision = decisions[action.type];
    return json({ ok: true });
  }

  if (request.method === "GET" && operation === "report") {
    const report = [
      "SentinelMail forensic report",
      `Case: ${kase.case_number}`,
      `Subject: ${kase.subject}`,
      `Sender: ${kase.sender}`,
      `Risk: ${kase.risk_score}/100 (${kase.severity})`,
      "",
      kase.decision_banner,
      "",
      ...kase.timeline.map((entry) => `• ${entry.title}: ${entry.description}`),
    ].join("\n");
    return new Response(report, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return apiError("Method not allowed.", 405);
}
