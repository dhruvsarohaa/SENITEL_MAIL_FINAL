import pg from "pg";
import crypto from "node:crypto";
import type { Case, CaseSummary, VendorProfile, Campaign, AnalystAction } from "../types.js";
import { seedVendors, seedCases, seedCampaigns } from "./seed-data.js";
import { isMongoActive, getCollections, getNextCaseNumberMongo } from "./mongo.js";

const { Pool } = pg;

export let isPostgresActive = false;
export let realPool: pg.Pool | null = null;

// In-memory fallback store when neither MongoDB nor PostgreSQL is connected
export class MemoryStore {
  vendors = new Map<string, VendorProfile>();
  cases = new Map<string, Case>();
  campaigns = new Map<string, Campaign>();
  actions = new Map<string, (AnalystAction & { case_id: string })[]>();
  indicators: { id: string; case_id: string; type: string; value: string }[] = [];
  caseSeq = 1043;

  constructor() {
    this.seedDefaults();
  }

  seedDefaults() {
    const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
    for (const v of seedVendors) {
      this.vendors.set(v.id, { ...v, org_id: (v as any).org_id || DEFAULT_ORG_ID } as any);
    }
    for (const c of seedCases) {
      this.cases.set(c.id, { ...c, org_id: (c as any).org_id || DEFAULT_ORG_ID } as any);
    }
    for (const camp of seedCampaigns) {
      this.campaigns.set(camp.id, {
        ...camp,
        org_id: (camp as any).org_id || DEFAULT_ORG_ID,
      } as any);
    }
  }
}

export const memoryStore = new MemoryStore();

/**
 * Check if PostgreSQL is accessible
 */
export async function initDbPool(): Promise<boolean> {
  const connStr = process.env["DATABASE_URL"];
  if (!connStr) {
    return false;
  }

  try {
    const testPool = new Pool({
      connectionString: connStr,
      connectionTimeoutMillis: 2000,
    });
    testPool.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL client:", err);
    });
    const client = await testPool.connect();
    client.release();
    realPool = testPool;
    isPostgresActive = true;
    console.log("✅ Connected to PostgreSQL database.");
    return true;
  } catch (err) {
    console.warn("\n" + "=".repeat(72));
    console.warn("  ⚠️   CRITICAL DATABASE WARNING: POSTGRESQL UNREACHABLE");
    console.warn("  ------------------------------------------------------------------------");
    console.warn(`  Target: ${connStr.replace(/:[^:@]+@/, ":***@")}`);
    console.warn(`  Reason: ${err instanceof Error ? err.message : String(err)}`);
    console.warn("  ACTION: Falling back to EPHEMERAL in-memory MemoryStore.");
    console.warn("  ⚠️   WARNING: DATA WILL NOT PERSIST ACROSS PROCESS RESTARTS!");
    console.warn("=".repeat(72) + "\n");
    isPostgresActive = false;
    realPool = null;
    return false;
  }
}

/** Close PostgreSQL pool safely */
export async function closePostgres(): Promise<void> {
  if (realPool) {
    await realPool.end();
    realPool = null;
  }
  isPostgresActive = false;
}

/**
 * Universal query wrapper that executes against:
 * 1. PostgreSQL (when DATABASE_URL is configured and active - PRIMARY)
 * 2. MongoDB (when MONGODB_URI is configured and active - SECONDARY)
 * 3. MemoryStore (in-memory zero-dependency fallback for local development)
 */
export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const isProd = process.env.NODE_ENV === "production";
  const hasPgConfig = Boolean(process.env["DATABASE_URL"]);

  // 1. PostgreSQL path (Primary)
  if (isPostgresActive && realPool) {
    try {
      return (await realPool.query(text, params)) as unknown as { rows: T[] };
    } catch (err) {
      if (isProd) {
        console.error("CRITICAL: PostgreSQL query failed in production:", err);
        throw err;
      }
      console.warn("⚠️ PostgreSQL query failed, falling back to local MemoryStore:", err);
    }
  } else if (hasPgConfig && isProd) {
    throw new Error("503: Primary database is unreachable in production mode.");
  }

  // 2. MongoDB path (Secondary)
  if (isMongoActive) {
    const cols = getCollections();
    if (cols) {
      const mongoRows = await executeMongoQuery<T>(cols, text.trim(), params);
      if (mongoRows !== null) {
        return { rows: mongoRows };
      }
    }
  }

  // 3. In-memory fallback queries (Local dev only)
  const sql = text.trim();

  // Next sequence for case_number
  if (sql.includes("nextval('case_number_seq')")) {
    const nextVal = String(memoryStore.caseSeq++);
    return { rows: [{ nextval: nextVal }] as unknown as T[] };
  }

  // Vendors query with filtering
  if (sql.includes("FROM vendors")) {
    let vendors = Array.from(memoryStore.vendors.values());
    if (sql.includes("$1 = ANY(trusted_domains)") || sql.includes("trusted_domains @>")) {
      const targetDomain = params?.[0]?.toLowerCase();
      vendors = vendors.filter((v) =>
        v.trusted_domains.some((d) => d.toLowerCase() === targetDomain),
      );
    } else if (sql.includes("WHERE id = $1 AND org_id = $2")) {
      const vendorId = params?.[0];
      const orgId = params?.[1];
      vendors = vendors.filter(
        (v: any) =>
          v.id === vendorId && (v.org_id || "00000000-0000-0000-0000-000000000001") === orgId,
      );
    } else if (sql.includes("WHERE id = $1")) {
      const vendorId = params?.[0];
      vendors = vendors.filter((v) => v.id === vendorId);
    } else if (sql.includes("WHERE org_id = $1")) {
      const orgId = params?.[0];
      vendors = vendors.filter(
        (v: any) => (v.org_id || "00000000-0000-0000-0000-000000000001") === orgId,
      );
    }
    if (sql.includes("ORDER BY name")) {
      vendors.sort((a, b) => a.name.localeCompare(b.name));
    }
    return { rows: vendors as unknown as T[] };
  }

  // Insert Vendor
  if (sql.startsWith("INSERT INTO vendors")) {
    if (params) {
      const [
        name,
        trusted_domains,
        trusted_contacts,
        approved_bank_suffixes,
        normal_recipients,
        org_id,
      ] = params;
      const id = `v-${Date.now()}`;
      const newVendor: VendorProfile = {
        id,
        name,
        trusted_domains: trusted_domains ?? [],
        trusted_contacts: trusted_contacts ?? [],
        approved_bank_suffixes: approved_bank_suffixes ?? [],
        normal_recipients: normal_recipients ?? [],
        risk_state: "trusted",
        relationship_since: new Date().toISOString(),
        anomalies: [],
      };
      (newVendor as any).org_id = org_id || "00000000-0000-0000-0000-000000000001";
      memoryStore.vendors.set(id, newVendor);
      return { rows: [newVendor] as unknown as T[] };
    }
    return { rows: [] };
  }

  // Update Vendor
  if (sql.startsWith("UPDATE vendors SET")) {
    if (params) {
      const vendorId = params[5] ?? params[params.length - 1];
      const orgId = sql.includes("org_id = $7") ? params[6] : undefined;
      const vendor = memoryStore.vendors.get(vendorId);
      if (vendor) {
        if (orgId && (vendor as any).org_id && (vendor as any).org_id !== orgId) {
          return { rows: [] };
        }
        if (sql.includes("last_interaction = now()")) {
          vendor.last_interaction = new Date().toISOString();
        }
        if (sql.includes("anomalies = $1")) {
          vendor.anomalies = typeof params[0] === "string" ? JSON.parse(params[0]) : params[0];
          vendor.risk_state = params[1];
        } else if (params.length >= 6) {
          if (params[0]) vendor.name = params[0];
          if (params[1]) vendor.trusted_domains = params[1];
          if (params[2]) vendor.trusted_contacts = params[2];
          if (params[3]) vendor.approved_bank_suffixes = params[3];
          if (params[4]) vendor.normal_recipients = params[4];
        }
        return { rows: [vendor] as unknown as T[] };
      }
    }
    return { rows: [] };
  }

  // Delete Vendor
  if (sql.startsWith("DELETE FROM vendors")) {
    if (params) {
      const vendorId = params[0];
      const orgId = params[1];
      const vendor = memoryStore.vendors.get(vendorId);
      if (vendor) {
        if (orgId && (vendor as any).org_id && (vendor as any).org_id !== orgId) {
          return { rows: [] };
        }
        memoryStore.vendors.delete(vendorId);
        return { rows: [{ id: vendorId }] as unknown as T[] };
      }
    }
    return { rows: [] };
  }

  // Insert case
  if (sql.startsWith("INSERT INTO cases")) {
    if (params) {
      const colMatch = sql.match(/INSERT INTO cases\s*\(([^)]+)\)/i);
      const pMap: Record<string, any> = {};
      if (colMatch && colMatch[1]) {
        const cols = colMatch[1].split(",").map((c) => c.trim().toLowerCase());
        cols.forEach((col, idx) => {
          pMap[col] = params[idx];
        });
      }

      const id = pMap.id ?? params[0];
      const case_number = pMap.case_number ?? params[1];
      const subject = pMap.subject ?? params[2];
      const sender = pMap.sender ?? params[3];
      const recipients = pMap.recipients ?? params[4];
      const threat_class = pMap.threat_class ?? params[5];
      const risk_score = pMap.risk_score ?? params[6];
      const severity = pMap.severity ?? params[7];
      const confidence = pMap.confidence ?? params[8];
      const decision = pMap.decision ?? params[9];
      const assigned_action = pMap.assigned_action ?? params[10];
      const decision_banner = pMap.decision_banner ?? params[11];
      const vendor_id = pMap.vendor_id ?? params[12];
      const vendor_name = pMap.vendor_name ?? params[13];
      const amount_at_risk = pMap.amount_at_risk ?? params[14];
      const currency = pMap.currency ?? params[15];
      const body_preview = pMap.body_preview ?? params[16];
      const evidenceJson = pMap.evidence ?? params[17];
      const timelineJson = pMap.timeline ?? params[18];
      const relayPathJson = pMap.relay_path ?? params[19];
      const raw_eml = pMap.raw_eml ?? params[20];
      const eml_sha256 = pMap.eml_sha256 ?? params[21];

      const org_id =
        pMap.org_id ??
        (colMatch && colMatch[1] && colMatch[1].includes("org_id")
          ? params[
              colMatch[1]
                .split(",")
                .map((c) => c.trim().toLowerCase())
                .indexOf("org_id")
            ]
          : undefined) ??
        "00000000-0000-0000-0000-000000000001";

      const safeParse = (val: any, fallback: any) => {
        if (typeof val !== "string") return val ?? fallback;
        try {
          return JSON.parse(val);
        } catch {
          return fallback;
        }
      };

      const kase: Case = {
        id,
        case_number,
        subject,
        sender,
        recipients: recipients ?? [],
        threat_class,
        risk_score: Number(risk_score) || 0,
        severity,
        confidence: Number(confidence) || 0.5,
        decision,
        assigned_action,
        decision_banner,
        vendor: vendor_name ?? "—",
        amount_at_risk: amount_at_risk ? Number(amount_at_risk) : undefined,
        currency,
        body_preview,
        evidence: safeParse(evidenceJson, {}),
        timeline: safeParse(timelineJson, []),
        relay_path: safeParse(relayPathJson, []),
        origin_assessment: safeParse(pMap.origin_assessment, undefined),
        domain_intelligence: safeParse(pMap.domain_intelligence, undefined),
        created_at: new Date().toISOString(),
        actions: [],
      };
      (kase as any).org_id = org_id;
      memoryStore.cases.set(id, kase);
    }
    return { rows: [] };
  }

  // Select cases list
  if (
    sql.includes("FROM cases") &&
    sql.includes("ORDER BY created_at DESC") &&
    !sql.includes("vendor_id = $1") &&
    !sql.includes("case_number = ANY($1)")
  ) {
    const orgId = sql.includes("org_id = $1") ? params?.[0] : undefined;
    const allCases = Array.from(memoryStore.cases.values());
    const filtered = orgId
      ? allCases.filter((c: any) => (c.org_id || "00000000-0000-0000-0000-000000000001") === orgId)
      : allCases;
    const summaries: CaseSummary[] = filtered
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((c) => ({
        id: c.id,
        case_number: c.case_number,
        subject: c.subject,
        sender: c.sender,
        threat_class: c.threat_class,
        risk_score: c.risk_score,
        severity: c.severity,
        decision: c.decision,
        assigned_action: c.assigned_action,
        vendor: c.vendor,
        amount_at_risk: c.amount_at_risk,
        triage_minutes: c.triage_minutes,
        currency: c.currency,
        created_at: c.created_at,
      }));
    return { rows: summaries as unknown as T[] };
  }

  // Get single case
  if (
    sql.includes("FROM cases") &&
    sql.includes("WHERE") &&
    (sql.includes("c.id") || sql.includes("case_number") || sql.includes("id ="))
  ) {
    const idOrNum = params?.[0];
    const orgId = sql.includes("org_id = $2") ? params?.[1] : undefined;
    const found = Array.from(memoryStore.cases.values()).find(
      (c: any) =>
        (c.id === idOrNum || c.case_number === idOrNum) &&
        (!orgId || (c.org_id || "00000000-0000-0000-0000-000000000001") === orgId),
    );
    if (found) {
      return {
        rows: [
          {
            ...found,
            vendor_name: found.vendor,
            vendor_name_joined: found.vendor,
            evidence: found.evidence,
            timeline: found.timeline,
            relay_path: found.relay_path,
            campaign_graph: found.campaign_graph,
          },
        ] as unknown as T[],
      };
    }
    return { rows: [] };
  }

  // Get actions for case
  if (sql.startsWith("SELECT type, note, analyst, created_at FROM actions WHERE case_id = $1")) {
    const caseId = params?.[0];
    const actions = memoryStore.actions.get(caseId) ?? [];
    return { rows: actions as unknown as T[] };
  }

  // Insert action
  if (sql.startsWith("INSERT INTO actions")) {
    if (params) {
      const [case_id, type, note, analyst] = params;
      const list = memoryStore.actions.get(case_id) ?? [];
      const newAction = { type, note, analyst, created_at: new Date().toISOString() };
      list.push({ ...newAction, case_id });
      memoryStore.actions.set(case_id, list);

      const kase =
        memoryStore.cases.get(case_id) ||
        Array.from(memoryStore.cases.values()).find((c) => c.case_number === case_id);
      if (kase) {
        kase.actions = kase.actions ?? [];
        kase.actions.push(newAction);
      }
    }
    return { rows: [] };
  }

  // Update case decision, triage_minutes, or campaign re-fusion
  if (sql.startsWith("UPDATE cases SET")) {
    if (params) {
      if (sql.includes("campaign_id = $1, campaign_graph = $2")) {
        const id = params[params.length - 1];
        const kase =
          memoryStore.cases.get(id) ||
          Array.from(memoryStore.cases.values()).find((c) => c.case_number === id);
        if (kase) {
          (kase as any).campaign_id = params[0];
          (kase as any).campaign_graph =
            typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
          (kase as any).risk_score = params[2];
          (kase as any).confidence = params[3];
          if (params.length >= 8) {
            (kase as any).severity = params[4];
            (kase as any).assigned_action = params[5];
            (kase as any).decision_banner = params[6];
          }
          if (params.length >= 9) {
            (kase as any).decision = params[7];
          }
        }
      } else if (sql.includes("decision = $1")) {
        const id = params.length >= 4 ? params[2] : params[params.length - 1];
        const orgId = sql.includes("org_id = $4") ? params[3] : undefined;
        const kase =
          memoryStore.cases.get(id) ||
          Array.from(memoryStore.cases.values()).find((c) => c.case_number === id);
        if (kase && (!orgId || (kase as any).org_id === orgId)) {
          if (params[0]) kase.decision = params[0];
          if (typeof params[1] === "number") kase.triage_minutes = params[1];
        }
      } else if (sql.includes("campaign_id = $1, updated_at = now() WHERE id = ANY($2)")) {
        const campId = params[0];
        const ids = (params[1] as string[]) || [];
        for (const c of memoryStore.cases.values()) {
          if (ids.includes(c.id) || ids.includes(c.case_number)) {
            (c as any).campaign_id = campId;
          }
        }
      } else if (sql.includes("campaign_graph = $1, updated_at = now() WHERE id = ANY($2)")) {
        const graph = typeof params[0] === "string" ? JSON.parse(params[0]) : params[0];
        const ids = (params[1] as string[]) || [];
        for (const c of memoryStore.cases.values()) {
          if (ids.includes(c.id) || ids.includes(c.case_number)) {
            (c as any).campaign_graph = graph;
          }
        }
      }
    }
    return { rows: [] };
  }

  // Insert campaign in MemoryStore
  if (sql.startsWith("INSERT INTO campaigns")) {
    if (params) {
      const [
        id,
        org_id,
        name,
        severity,
        shared_indicators,
        case_ids,
        case_count,
        domains,
        reply_tos,
        bank_accounts,
        attachment_hashes,
        recommended_actions,
      ] = params;
      const campDoc: Campaign & { org_id?: string } = {
        id,
        name,
        severity,
        case_count: Number(case_count),
        shared_indicators: shared_indicators ?? [],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        case_ids: case_ids ?? [],
        victim_teams: [],
        domains: domains ?? [],
        reply_tos: reply_tos ?? [],
        bank_accounts: bank_accounts ?? [],
        attachment_hashes: attachment_hashes ?? [],
        recommended_actions: recommended_actions ?? [],
      };
      (campDoc as any).org_id = org_id || "00000000-0000-0000-0000-000000000001";
      memoryStore.campaigns.set(id, campDoc as Campaign);
    }
    return { rows: [] };
  }

  // Update campaign in MemoryStore
  if (sql.startsWith("UPDATE campaigns SET")) {
    if (params) {
      const campaignId = params[params.length - 1];
      const camp = memoryStore.campaigns.get(campaignId);
      if (camp) {
        camp.case_ids = params[0] ?? camp.case_ids;
        camp.shared_indicators = params[1] ?? camp.shared_indicators;
        camp.severity = params[2] ?? camp.severity;
        camp.case_count = Number(params[3]) || camp.case_count;
        camp.domains = params[4] ?? camp.domains;
        camp.reply_tos = params[5] ?? camp.reply_tos;
        camp.bank_accounts = params[6] ?? camp.bank_accounts;
        camp.attachment_hashes = params[7] ?? camp.attachment_hashes;
        camp.last_seen = new Date().toISOString();
      }
    }
    return { rows: [] };
  }

  // Single campaign
  if (sql.includes("FROM campaigns") && sql.includes("WHERE id = $1")) {
    const campId = params?.[0];
    const orgId = sql.includes("org_id = $2") ? params?.[1] : undefined;
    const camp = memoryStore.campaigns.get(campId);
    if (camp) {
      if (orgId && (camp as any).org_id && (camp as any).org_id !== orgId) {
        return { rows: [] };
      }
      return { rows: [camp] as unknown as T[] };
    }
    return { rows: [] };
  }

  // Campaigns list
  if (sql.includes("FROM campaigns")) {
    let campaigns = Array.from(memoryStore.campaigns.values());
    if (sql.includes("WHERE org_id = $1")) {
      const orgId = params?.[0];
      campaigns = campaigns.filter(
        (c: any) => (c.org_id || "00000000-0000-0000-0000-000000000001") === orgId,
      );
    }
    return { rows: campaigns as unknown as T[] };
  }

  // Cases selection by id = ANY($1) (campaign cluster queries)
  if (sql.includes("FROM cases") && sql.includes("WHERE id = ANY($1)")) {
    const ids = (params?.[0] as string[]) || [];
    let matching = Array.from(memoryStore.cases.values()).filter(
      (c: any) => ids.includes(c.id) || ids.includes(c.case_number),
    );
    if (sql.includes("campaign_id IS NOT NULL")) {
      matching = matching.filter((c: any) => c.campaign_id != null);
    }
    if (sql.includes("ORDER BY risk_score DESC")) {
      matching.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
    } else if (sql.includes("ORDER BY created_at")) {
      matching.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    if (sql.includes("LIMIT 1")) {
      matching = matching.slice(0, 1);
    }
    return { rows: matching as unknown as T[] };
  }

  // Multi cases selection (campaigns array)
  if (sql.includes("FROM cases") && sql.includes("WHERE case_number = ANY($1)")) {
    const caseNumbers = (params?.[0] as string[]) || [];
    const orgId = sql.includes("org_id = $2") ? params?.[1] : undefined;
    const foundCases = Array.from(memoryStore.cases.values())
      .filter(
        (c: any) =>
          (caseNumbers.includes(c.case_number) || caseNumbers.includes(c.id)) &&
          (!orgId || (c.org_id || "00000000-0000-0000-0000-000000000001") === orgId),
      )
      .map((c) => ({
        id: c.id,
        case_number: c.case_number,
        subject: c.subject,
        sender: c.sender,
        threat_class: c.threat_class,
        risk_score: c.risk_score,
        severity: c.severity,
        decision: c.decision,
        assigned_action: c.assigned_action,
        vendor: c.vendor,
        amount_at_risk: c.amount_at_risk,
        currency: c.currency,
        created_at: c.created_at,
      }));
    return { rows: foundCases as unknown as T[] };
  }

  // Insert indicators
  if (sql.startsWith("INSERT INTO indicators")) {
    if (params) {
      const [case_id, type, value] = params;
      const existing = memoryStore.indicators.find(
        (i) => i.case_id === case_id && i.type === type && i.value === value,
      );
      if (!existing) {
        memoryStore.indicators.push({ id: `ind-${Date.now()}`, case_id, type, value });
      }
    }
    return { rows: [] };
  }

  // Indicator correlation (self join emulation)
  if (sql.includes("FROM indicators i1") && sql.includes("JOIN indicators i2")) {
    const currentCaseId = params?.[0];
    const targetOrgId = params?.[1];
    const currentIndicators = memoryStore.indicators.filter((i) => i.case_id === currentCaseId);
    if (currentIndicators.length === 0) return { rows: [] };

    const otherCaseMatches = new Map<string, Set<string>>();
    for (const ind of currentIndicators) {
      const matches = memoryStore.indicators.filter(
        (i) => i.type === ind.type && i.value === ind.value && i.case_id !== currentCaseId,
      );
      for (const m of matches) {
        if (targetOrgId) {
          const otherCase = memoryStore.cases.get(m.case_id);
          if (otherCase && (otherCase as any).org_id && (otherCase as any).org_id !== targetOrgId) {
            continue;
          }
        }
        if (!otherCaseMatches.has(m.case_id)) otherCaseMatches.set(m.case_id, new Set());
        otherCaseMatches.get(m.case_id)!.add(`${m.type}:${m.value}`);
      }
    }

    const rows: any[] = [];
    for (const [otherCaseId, sharedSet] of otherCaseMatches.entries()) {
      const shared = Array.from(sharedSet);
      const uniqueTypes = new Set(shared.map((s) => s.split(":")[0])).size;
      if (uniqueTypes >= 2) {
        rows.push({ other_case_id: otherCaseId, match_types: uniqueTypes, shared });
      }
    }
    rows.sort((a, b) => b.match_types - a.match_types);
    return { rows: rows as unknown as T[] };
  }

  // Behavioral queries in MemoryStore
  if (sql.includes("evidence->'sender_identity'->>'reply_to'")) {
    const vendorId = params?.[0];
    const orgId = params?.[1];
    const set = new Set<string>();
    for (const c of memoryStore.cases.values()) {
      if (c.vendor_id === vendorId || (c as any).vendor === vendorId) {
        if (orgId && (c as any).org_id && (c as any).org_id !== orgId) continue;
        const rt = (c.evidence as any)?.sender_identity?.reply_to;
        if (rt) set.add(rt);
      }
    }
    return { rows: Array.from(set).map((reply_to) => ({ reply_to })) as unknown as T[] };
  }

  if (sql.includes("SELECT body_preview FROM cases")) {
    const vendorId = params?.[0];
    const orgId = params?.[1];
    const matched = Array.from(memoryStore.cases.values())
      .filter((c: any) => {
        if (c.vendor_id !== vendorId && c.vendor !== vendorId && c.vendor_name !== vendorId)
          return false;
        if (orgId && (c as any).org_id && (c as any).org_id !== orgId) return false;
        return Boolean(c.body_preview);
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map((c) => ({ body_preview: c.body_preview }));
    return { rows: matched as unknown as T[] };
  }

  if (sql.includes("send_hour") || sql.includes("EXTRACT(HOUR FROM created_at)")) {
    const vendorId = params?.[0];
    const orgId = params?.[1];
    const matched = Array.from(memoryStore.cases.values())
      .filter((c: any) => {
        if (c.vendor_id !== vendorId && c.vendor !== vendorId && c.vendor_name !== vendorId)
          return false;
        if (orgId && (c as any).org_id && (c as any).org_id !== orgId) return false;
        return Boolean(c.created_at);
      })
      .map((c) => ({ send_hour: new Date(c.created_at).getUTCHours() }));
    return { rows: matched as unknown as T[] };
  }

  // Users & Organizations emulation in MemoryStore
  if (sql.includes("FROM users u") && sql.includes("JOIN organizations o")) {
    const email = params?.[0]?.toLowerCase();
    const defaultUser = {
      id: "00000000-0000-0000-0000-000000000002",
      org_id: "00000000-0000-0000-0000-000000000001",
      email: "security-admin@sentinelmail.io",
      name: "Security Admin",
      role: "admin",
      org_name: "Sentinel Corporation",
      org_slug: "sentinel-corp",
      org_plan: "enterprise",
    };
    if (email === "security-admin@sentinelmail.io") {
      return { rows: [defaultUser] as unknown as T[] };
    }
    return { rows: [] };
  }

  // Fallback default
  return { rows: [] };
}

/**
 * Execute query against native MongoDB collections.
 */
async function executeMongoQuery<T>(
  cols: ReturnType<typeof getCollections> & object,
  sql: string,
  params?: any[],
): Promise<T[] | null> {
  // 1. Next sequence for case_number
  if (sql.includes("nextval('case_number_seq')")) {
    const nextVal = await getNextCaseNumberMongo();
    return [{ nextval: nextVal }] as unknown as T[];
  }

  // 2. Select vendors
  if (sql.includes("FROM vendors") && sql.startsWith("SELECT")) {
    let filter: any = {};
    if (sql.includes("$1 = ANY(trusted_domains)") || sql.includes("trusted_domains @>")) {
      const targetDomain = params?.[0]?.toLowerCase();
      filter = { trusted_domains: targetDomain };
    } else if (sql.includes("WHERE id = $1 AND org_id = $2")) {
      filter = { id: params?.[0], org_id: params?.[1] };
    } else if (sql.includes("WHERE id = $1")) {
      filter = { id: params?.[0] };
    } else if (sql.includes("WHERE org_id = $1")) {
      filter = { org_id: params?.[0] };
    }

    let cursor = cols.vendors.find(filter);
    if (sql.includes("ORDER BY name")) {
      cursor = cursor.sort({ name: 1 });
    }
    const docs = await cursor.toArray();
    return docs.map((d) => ({
      id: d.id,
      name: d.name,
      trusted_domains: d.trusted_domains ?? [],
      trusted_contacts: d.trusted_contacts ?? [],
      approved_bank_suffixes: d.approved_bank_suffixes ?? [],
      normal_recipients: d.normal_recipients ?? [],
      risk_state: d.risk_state ?? "trusted",
      last_interaction: d.last_interaction,
      relationship_since: d.relationship_since,
      anomalies: d.anomalies ?? [],
    })) as unknown as T[];
  }

  // 3. Insert vendor
  if (sql.startsWith("INSERT INTO vendors")) {
    if (params) {
      const [
        name,
        trusted_domains,
        trusted_contacts,
        approved_bank_suffixes,
        normal_recipients,
        org_id,
      ] = params;
      const id = `v-${Date.now()}`;
      const newVendor: VendorProfile = {
        id,
        name,
        trusted_domains: trusted_domains ?? [],
        trusted_contacts: trusted_contacts ?? [],
        approved_bank_suffixes: approved_bank_suffixes ?? [],
        normal_recipients: normal_recipients ?? [],
        risk_state: "trusted",
        relationship_since: new Date().toISOString(),
        anomalies: [],
      };
      await cols.vendors.insertOne({
        ...newVendor,
        _id: id,
        org_id: org_id || "00000000-0000-0000-0000-000000000001",
      } as any);
      return [newVendor] as unknown as T[];
    }
    return [];
  }

  // 4. Update vendor
  if (sql.startsWith("UPDATE vendors SET")) {
    if (params) {
      const vendorId = params[5] ?? params[params.length - 1];
      const orgId = sql.includes("org_id = $7") ? params[6] : undefined;
      const updateDoc: any = { updated_at: new Date() };

      if (sql.includes("last_interaction = now()")) {
        updateDoc.last_interaction = new Date().toISOString();
      }
      if (sql.includes("anomalies = $1")) {
        const anomalies = typeof params[0] === "string" ? JSON.parse(params[0]) : params[0];
        updateDoc.anomalies = anomalies;
        updateDoc.risk_state = params[1];
      } else if (params.length >= 6) {
        if (params[0]) updateDoc.name = params[0];
        if (params[1]) updateDoc.trusted_domains = params[1];
        if (params[2]) updateDoc.trusted_contacts = params[2];
        if (params[3]) updateDoc.approved_bank_suffixes = params[3];
        if (params[4]) updateDoc.normal_recipients = params[4];
      }
      const filter: any = { $or: [{ id: vendorId }, { _id: vendorId }] };
      if (orgId) {
        filter.org_id = orgId;
      }
      const res = await cols.vendors.findOneAndUpdate(
        filter,
        { $set: updateDoc },
        { returnDocument: "after" },
      );
      return res ? ([res] as unknown as T[]) : [];
    }
    return [];
  }

  // Delete vendor
  if (sql.startsWith("DELETE FROM vendors")) {
    const vendorId = params?.[0];
    const orgId = params?.[1];
    const filter: any = { $or: [{ id: vendorId }, { _id: vendorId }] };
    if (orgId) {
      filter.org_id = orgId;
    }
    const res = await cols.vendors.deleteOne(filter);
    return res.deletedCount > 0 ? ([{ id: vendorId }] as unknown as T[]) : [];
  }

  // 5. Insert case
  if (sql.startsWith("INSERT INTO cases")) {
    if (params) {
      const colMatch = sql.match(/INSERT INTO cases\s*\(([^)]+)\)/i);
      const pMap: Record<string, any> = {};
      if (colMatch && colMatch[1]) {
        const cols = colMatch[1].split(",").map((c) => c.trim().toLowerCase());
        cols.forEach((col, idx) => {
          pMap[col] = params[idx];
        });
      }

      const id = pMap.id ?? params[0];
      const case_number = pMap.case_number ?? params[1];
      const org_id = pMap.org_id;
      const subject = pMap.subject ?? params[2];
      const sender = pMap.sender ?? params[3];
      const recipients = pMap.recipients ?? params[4];
      const threat_class = pMap.threat_class ?? params[5];
      const risk_score = pMap.risk_score ?? params[6];
      const severity = pMap.severity ?? params[7];
      const confidence = pMap.confidence ?? params[8];
      const decision = pMap.decision ?? params[9];
      const assigned_action = pMap.assigned_action ?? params[10];
      const decision_banner = pMap.decision_banner ?? params[11];
      const vendor_id = pMap.vendor_id ?? params[12];
      const vendor_name = pMap.vendor_name ?? params[13];
      const amount_at_risk = pMap.amount_at_risk ?? params[14];
      const currency = pMap.currency ?? params[15];
      const body_preview = pMap.body_preview ?? params[16];
      const evidenceJson = pMap.evidence ?? params[17];
      const timelineJson = pMap.timeline ?? params[18];
      const relayPathJson = pMap.relay_path ?? params[19];
      const raw_eml = pMap.raw_eml ?? params[20];
      const eml_sha256 = pMap.eml_sha256 ?? params[21];

      const safeParse = (val: any, fallback: any) => {
        if (typeof val !== "string") return val ?? fallback;
        try {
          return JSON.parse(val);
        } catch {
          return fallback;
        }
      };

      const caseDoc: any = {
        _id: id,
        id,
        org_id,
        case_number,
        subject,
        sender,
        recipients: recipients ?? [],
        threat_class,
        risk_score: Number(risk_score) || 0,
        severity,
        confidence: Number(confidence) || 0.5,
        decision: decision ?? "pending",
        assigned_action,
        decision_banner,
        vendor: vendor_name ?? "—",
        vendor_id,
        vendor_name,
        amount_at_risk: amount_at_risk ? Number(amount_at_risk) : undefined,
        currency,
        body_preview,
        evidence: safeParse(evidenceJson, {}),
        timeline: safeParse(timelineJson, []),
        relay_path: safeParse(relayPathJson, []),
        origin_assessment: safeParse(pMap.origin_assessment, undefined),
        domain_intelligence: safeParse(pMap.domain_intelligence, undefined),
        raw_eml,
        eml_sha256,
        created_at: new Date().toISOString(),
        actions: [],
      };

      await cols.cases.updateOne({ _id: id }, { $set: caseDoc }, { upsert: true });
    }
    return [];
  }

  // 6. Select cases list
  if (
    sql.includes("FROM cases") &&
    sql.includes("ORDER BY created_at DESC") &&
    !sql.includes("vendor_id = $1") &&
    !sql.includes("case_number = ANY($1)")
  ) {
    const orgId = sql.includes("org_id = $1") ? params?.[0] : undefined;
    const filter = orgId ? { org_id: orgId } : {};
    const docs = await cols.cases.find(filter).sort({ created_at: -1 }).toArray();
    const summaries: CaseSummary[] = docs.map((c) => ({
      id: c.id,
      case_number: c.case_number,
      subject: c.subject,
      sender: c.sender,
      threat_class: c.threat_class,
      risk_score: c.risk_score,
      severity: c.severity,
      decision: c.decision,
      assigned_action: c.assigned_action,
      vendor: c.vendor ?? c.vendor_name ?? "—",
      amount_at_risk: c.amount_at_risk,
      triage_minutes: c.triage_minutes,
      currency: c.currency,
      created_at: c.created_at,
    }));
    return summaries as unknown as T[];
  }

  // 7. Select cases filtered by vendor or case_numbers
  if (
    sql.includes("FROM cases WHERE vendor_id = $1") &&
    !sql.includes("SELECT body_preview") &&
    !sql.includes("send_hour") &&
    !sql.includes("EXTRACT(HOUR")
  ) {
    const vendorId = params?.[0];
    const orgId = sql.includes("org_id = $2") ? params?.[1] : undefined;
    const filter: any = { vendor_id: vendorId };
    if (orgId) filter.org_id = orgId;
    const docs = await cols.cases.find(filter).sort({ created_at: -1 }).limit(20).toArray();
    return docs.map((d) => ({
      id: d.id,
      body_preview: d.body_preview,
      send_hour: new Date(d.created_at).getUTCHours(),
    })) as unknown as T[];
  }

  if (sql.includes("FROM cases WHERE case_number = ANY($1)")) {
    const caseNumbers: string[] = params?.[0] ?? [];
    const orgId = sql.includes("org_id = $2") ? params?.[1] : undefined;
    const filter: any = { case_number: { $in: caseNumbers } };
    if (orgId) {
      filter.org_id = orgId;
    }
    const docs = await cols.cases.find(filter).sort({ created_at: -1 }).toArray();
    return docs.map((c) => ({
      id: c.id,
      case_number: c.case_number,
      subject: c.subject,
      sender: c.sender,
      threat_class: c.threat_class,
      risk_score: c.risk_score,
      severity: c.severity,
      decision: c.decision,
      assigned_action: c.assigned_action,
      vendor: c.vendor ?? c.vendor_name ?? "—",
      amount_at_risk: c.amount_at_risk,
      currency: c.currency,
      created_at: c.created_at,
    })) as unknown as T[];
  }

  // 8. Select single case detail
  if (
    sql.includes("FROM cases") &&
    sql.includes("WHERE") &&
    (sql.includes("c.id") || sql.includes("case_number") || sql.includes("id ="))
  ) {
    const idOrNum = params?.[0];
    const orgId = sql.includes("org_id = $2") ? params?.[1] : undefined;
    const filter: any = {
      $or: [{ id: idOrNum }, { case_number: idOrNum }, { _id: idOrNum }],
    };
    if (orgId) {
      filter.org_id = orgId;
    }
    const found = await cols.cases.findOne(filter);
    if (found) {
      return [
        {
          ...found,
          vendor_name: found.vendor ?? found.vendor_name,
          vendor_name_joined: found.vendor ?? found.vendor_name,
        },
      ] as unknown as T[];
    }
    return [];
  }

  // 9. Update case
  if (sql.startsWith("UPDATE cases SET")) {
    if (params) {
      if (sql.includes("decision = $1, triage_minutes = $2")) {
        const id = params[2];
        await cols.cases.updateOne(
          { $or: [{ id }, { case_number: id }, { _id: id }] },
          {
            $set: {
              decision: params[0],
              triage_minutes: params[1],
              updated_at: new Date().toISOString(),
            },
          },
        );
      } else if (sql.includes("campaign_id = $1, campaign_graph = $2")) {
        const id = params[params.length - 1];
        const campaignGraph = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        const setDoc: Record<string, any> = {
          campaign_id: params[0],
          campaign_graph: campaignGraph,
          risk_score: params[2],
          confidence: params[3],
          updated_at: new Date().toISOString(),
        };
        if (params.length >= 8) {
          setDoc.severity = params[4];
          setDoc.assigned_action = params[5];
          setDoc.decision_banner = params[6];
        }
        if (params.length >= 9) {
          setDoc.decision = params[7];
        }
        await cols.cases.updateOne(
          { $or: [{ id }, { _id: id }, { case_number: id }] },
          { $set: setDoc },
        );
      } else if (sql.includes("campaign_id = $1, updated_at = now() WHERE id = ANY($2)")) {
        await cols.cases.updateMany(
          { id: { $in: params[1] } },
          { $set: { campaign_id: params[0], updated_at: new Date().toISOString() } },
        );
      } else if (sql.includes("campaign_graph = $1, updated_at = now() WHERE id = ANY($2)")) {
        const campaignGraph = typeof params[0] === "string" ? JSON.parse(params[0]) : params[0];
        await cols.cases.updateMany(
          { id: { $in: params[1] } },
          { $set: { campaign_graph: campaignGraph, updated_at: new Date().toISOString() } },
        );
      }
    }
    return [];
  }

  // 10. Actions
  if (sql.startsWith("SELECT type, note, analyst, created_at FROM actions WHERE case_id = $1")) {
    const caseId = params?.[0];
    const actions = await cols.actions.find({ case_id: caseId }).sort({ created_at: 1 }).toArray();
    return actions as unknown as T[];
  }

  if (sql.startsWith("INSERT INTO actions")) {
    if (params) {
      const [case_id, type, note, analyst] = params;
      const newAction = {
        case_id,
        type,
        note: note ?? undefined,
        analyst: analyst ?? undefined,
        created_at: new Date(),
      };
      await cols.actions.insertOne(newAction as any);
      await cols.cases.updateOne(
        { $or: [{ id: case_id }, { case_number: case_id }, { _id: case_id }] },
        {
          $push: {
            actions: { ...newAction, created_at: newAction.created_at.toISOString() },
          } as any,
        },
      );
    }
    return [];
  }

  // Cases selection by id = ANY($1) (campaign cluster queries)
  if (sql.includes("FROM cases") && sql.includes("WHERE id = ANY($1)")) {
    const ids: string[] = params?.[0] ?? [];
    const filter: any = {
      $or: [{ id: { $in: ids } }, { _id: { $in: ids } }, { case_number: { $in: ids } }],
    };
    if (sql.includes("campaign_id IS NOT NULL")) {
      filter.campaign_id = { $ne: null, $exists: true };
    }
    let cursor = cols.cases.find(filter);
    if (sql.includes("ORDER BY risk_score DESC")) {
      cursor = cursor.sort({ risk_score: -1 });
    } else if (sql.includes("ORDER BY created_at")) {
      cursor = cursor.sort({ created_at: 1 });
    }
    if (sql.includes("LIMIT 1")) {
      cursor = cursor.limit(1);
    }
    const docs = await cursor.toArray();
    return docs as unknown as T[];
  }

  // 11. Campaigns
  if (sql.includes("FROM campaigns") && sql.includes("WHERE id = $1")) {
    const filter: any = { $or: [{ id: params?.[0] }, { _id: params?.[0] }] };
    if (sql.includes("org_id = $2")) {
      filter.org_id = params?.[1];
    }
    const camp = await cols.campaigns.findOne(filter);
    return camp ? ([camp] as unknown as T[]) : [];
  }

  if (sql.includes("FROM campaigns")) {
    const filter: any = {};
    if (sql.includes("WHERE org_id = $1")) {
      filter.org_id = params?.[0];
    }
    const camps = await cols.campaigns.find(filter).sort({ last_seen: -1 }).toArray();
    return camps as unknown as T[];
  }

  if (sql.startsWith("INSERT INTO campaigns")) {
    if (params) {
      const [
        id,
        org_id,
        name,
        severity,
        shared_indicators,
        case_ids,
        case_count,
        domains,
        reply_tos,
        bank_accounts,
        attachment_hashes,
        recommended_actions,
      ] = params;

      const campDoc: Campaign & { _id: string; org_id: string } = {
        _id: id,
        id,
        org_id: org_id || "00000000-0000-0000-0000-000000000001",
        name,
        severity,
        case_count: Number(case_count),
        shared_indicators: shared_indicators ?? [],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        case_ids: case_ids ?? [],
        victim_teams: [],
        domains: domains ?? [],
        reply_tos: reply_tos ?? [],
        bank_accounts: bank_accounts ?? [],
        attachment_hashes: attachment_hashes ?? [],
        recommended_actions: recommended_actions ?? [],
      };
      await cols.campaigns.updateOne({ _id: id }, { $set: campDoc }, { upsert: true });
    }
    return [];
  }

  if (sql.startsWith("UPDATE campaigns SET")) {
    if (params) {
      const campaignId = params[params.length - 1];
      await cols.campaigns.updateOne(
        { _id: campaignId },
        {
          $set: {
            case_ids: params[0],
            shared_indicators: params[1],
            last_seen: new Date().toISOString(),
            severity: params[2],
            case_count: params[3],
            domains: params[4],
            reply_tos: params[5],
            bank_accounts: params[6],
            attachment_hashes: params[7],
            updated_at: new Date().toISOString(),
          },
        },
      );
    }
    return [];
  }

  // 12. Indicators correlation query in campaign.ts
  if (sql.includes("FROM indicators i1") && sql.includes("JOIN indicators i2")) {
    const currentCaseId = params?.[0];
    const targetOrgId = params?.[1];
    const currentIndicators = await cols.indicators.find({ case_id: currentCaseId }).toArray();
    if (currentIndicators.length === 0) return [];

    const otherCaseMatches = new Map<string, Set<string>>();
    for (const ind of currentIndicators) {
      const matches = await cols.indicators
        .find({
          type: ind.type,
          value: ind.value,
          case_id: { $ne: currentCaseId },
        })
        .toArray();

      for (const m of matches) {
        if (targetOrgId) {
          const otherCase = await cols.cases.findOne({
            $or: [{ id: m.case_id }, { _id: m.case_id }],
          });
          if (otherCase && (otherCase as any).org_id && (otherCase as any).org_id !== targetOrgId) {
            continue;
          }
        }
        if (!otherCaseMatches.has(m.case_id)) {
          otherCaseMatches.set(m.case_id, new Set());
        }
        otherCaseMatches.get(m.case_id)!.add(`${m.type}:${m.value}`);
      }
    }

    const rows: any[] = [];
    for (const [otherCaseId, sharedSet] of otherCaseMatches.entries()) {
      const shared = Array.from(sharedSet);
      const uniqueTypes = new Set(shared.map((s) => s.split(":")[0])).size;
      if (uniqueTypes >= 2) {
        rows.push({
          other_case_id: otherCaseId,
          match_types: uniqueTypes,
          shared,
        });
      }
    }
    rows.sort((a, b) => b.match_types - a.match_types);
    return rows as unknown as T[];
  }

  // 13. Indicators insert
  if (sql.startsWith("INSERT INTO indicators")) {
    if (params) {
      const [case_id, type, value] = params;
      await cols.indicators.updateOne(
        { case_id, type, value },
        { $setOnInsert: { case_id, type, value, created_at: new Date() } },
        { upsert: true },
      );
    }
    return [];
  }

  // 14. Behavioral checks queries in MongoDB
  if (sql.includes("evidence->'sender_identity'->>'reply_to'")) {
    const vendorId = params?.[0];
    const orgId = params?.[1];
    const filter: any = {
      $or: [{ vendor_id: vendorId }, { vendor: vendorId }, { vendor_name: vendorId }],
    };
    if (orgId) filter.org_id = orgId;
    const replyTos = await cols.cases.distinct("evidence.sender_identity.reply_to", filter);
    return replyTos.filter(Boolean).map((r) => ({ reply_to: r })) as unknown as T[];
  }

  if (sql.includes("SELECT body_preview FROM cases")) {
    const vendorId = params?.[0];
    const orgId = params?.[1];
    const filter: any = {
      $or: [{ vendor_id: vendorId }, { vendor: vendorId }, { vendor_name: vendorId }],
      body_preview: { $ne: null, $exists: true },
    };
    if (orgId) filter.org_id = orgId;
    const docs = await cols.cases.find(filter).sort({ created_at: -1 }).limit(10).toArray();
    return docs.map((d) => ({ body_preview: d.body_preview })) as unknown as T[];
  }

  if (sql.includes("send_hour") || sql.includes("EXTRACT(HOUR FROM created_at)")) {
    const vendorId = params?.[0];
    const orgId = params?.[1];
    const filter: any = {
      $or: [{ vendor_id: vendorId }, { vendor: vendorId }, { vendor_name: vendorId }],
    };
    if (orgId) filter.org_id = orgId;
    const docs = await cols.cases.find(filter).toArray();
    return docs.map((d) => ({
      send_hour: new Date(d.created_at).getUTCHours(),
    })) as unknown as T[];
  }

  // 15. User + Org emulation in MongoDB
  if (sql.includes("FROM users u") && sql.includes("JOIN organizations o")) {
    const email = params?.[0]?.toLowerCase();
    const user = await cols.users.findOne({ email });
    if (!user) return [];
    const org = await cols.organizations.findOne({ id: user.org_id });
    return [
      {
        id: user.id,
        org_id: user.org_id,
        email: user.email,
        name: user.name,
        role: user.role,
        org_name: org?.name ?? "Sentinel Corporation",
        org_slug: org?.slug ?? "sentinel-corp",
        org_plan: org?.plan ?? "enterprise",
      },
    ] as unknown as T[];
  }

  // If no specific MongoDB mapping, return null to fall through
  return null;
}

/**
 * Get client helper (returns pool client or mock client for transactions)
 */
export async function getClient() {
  if (isPostgresActive && realPool) {
    return realPool.connect();
  }
  // Mock client for MongoDB or in-memory operations
  return {
    query: (text: string, params?: any[]) => query(text, params),
    release: () => {},
  };
}

export default {
  query,
  connect: getClient,
};
