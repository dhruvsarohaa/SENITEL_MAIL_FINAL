import pg from "pg";
import crypto from "node:crypto";
import type { Case, CaseSummary, VendorProfile, Campaign, AnalystAction } from "../types.js";
import { seedVendors, seedCases, seedCampaigns } from "./seed-data.js";
import { isMongoActive, getCollections, getNextCaseNumberMongo } from "./mongo.js";

const { Pool } = pg;

export let isPostgresActive = false;
let realPool: pg.Pool | null = null;

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
    for (const v of seedVendors) {
      this.vendors.set(v.id, v);
    }
    for (const c of seedCases) {
      this.cases.set(c.id, c);
    }
    for (const camp of seedCampaigns) {
      this.campaigns.set(camp.id, camp);
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
      connectionTimeoutMillis: 1500,
    });
    const client = await testPool.connect();
    client.release();
    realPool = testPool;
    isPostgresActive = true;
    console.log("✅ Connected to PostgreSQL database.");
    return true;
  } catch (err) {
    isPostgresActive = false;
    return false;
  }
}

/**
 * Universal query wrapper that executes against:
 * 1. MongoDB (when MONGODB_URI is configured and active)
 * 2. PostgreSQL (when DATABASE_URL is configured and active)
 * 3. MemoryStore (in-memory zero-dependency fallback)
 */
export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  // 1. PostgreSQL path
  if (isPostgresActive && realPool) {
    return (await realPool.query(text, params)) as unknown as { rows: T[] };
  }

  // 2. MongoDB path
  if (isMongoActive) {
    const cols = getCollections();
    if (cols) {
      try {
        const mongoRows = await executeMongoQuery<T>(cols, text.trim(), params);
        if (mongoRows !== null) {
          return { rows: mongoRows };
        }
      } catch (err) {
        console.error("MongoDB query execution error:", err);
      }
    }
  }

  // 3. In-memory fallback queries
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
    } else if (sql.includes("WHERE id = $1")) {
      const vendorId = params?.[0];
      vendors = vendors.filter((v) => v.id === vendorId);
    }
    if (sql.includes("ORDER BY name")) {
      vendors.sort((a, b) => a.name.localeCompare(b.name));
    }
    return { rows: vendors as unknown as T[] };
  }

  // Insert Vendor
  if (sql.startsWith("INSERT INTO vendors")) {
    if (params) {
      const [name, trusted_domains, trusted_contacts, approved_bank_suffixes, normal_recipients] =
        params;
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
      memoryStore.vendors.set(id, newVendor);
      return { rows: [newVendor] as unknown as T[] };
    }
    return { rows: [] };
  }

  // Update Vendor
  if (sql.startsWith("UPDATE vendors SET")) {
    if (params) {
      const vendorId = params[params.length - 1];
      const vendor = memoryStore.vendors.get(vendorId);
      if (vendor) {
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

  // Insert case
  if (sql.startsWith("INSERT INTO cases")) {
    if (params) {
      const [
        id,
        case_number,
        subject,
        sender,
        recipients,
        threat_class,
        risk_score,
        severity,
        confidence,
        decision,
        assigned_action,
        decision_banner,
        vendor_id,
        vendor_name,
        amount_at_risk,
        currency,
        body_preview,
        evidenceJson,
        timelineJson,
        relayPathJson,
        raw_eml,
        eml_sha256,
      ] = params;

      const kase: Case = {
        id,
        case_number,
        subject,
        sender,
        recipients,
        threat_class,
        risk_score,
        severity,
        confidence,
        decision,
        assigned_action,
        decision_banner,
        vendor: vendor_name ?? "—",
        amount_at_risk: amount_at_risk ? Number(amount_at_risk) : undefined,
        currency,
        body_preview,
        evidence: typeof evidenceJson === "string" ? JSON.parse(evidenceJson) : evidenceJson,
        timeline: typeof timelineJson === "string" ? JSON.parse(timelineJson) : timelineJson,
        relay_path: typeof relayPathJson === "string" ? JSON.parse(relayPathJson) : relayPathJson,
        created_at: new Date().toISOString(),
        actions: [],
      };
      memoryStore.cases.set(id, kase);
    }
    return { rows: [] };
  }

  // Select cases list
  if (
    sql.includes("FROM cases") &&
    sql.includes("ORDER BY created_at DESC") &&
    !sql.includes("WHERE")
  ) {
    const summaries: CaseSummary[] = Array.from(memoryStore.cases.values())
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
    (sql.includes("c.id = $1") || sql.includes("case_number = $1") || sql.includes("id = $1"))
  ) {
    const idOrNum = params?.[0];
    const found = Array.from(memoryStore.cases.values()).find(
      (c) => c.id === idOrNum || c.case_number === idOrNum,
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

  // Update case decision and triage_minutes
  if (sql.startsWith("UPDATE cases SET")) {
    if (params) {
      const id = params[params.length - 1];
      const kase =
        memoryStore.cases.get(id) ||
        Array.from(memoryStore.cases.values()).find((c) => c.case_number === id);
      if (kase) {
        if (params[0]) kase.decision = params[0];
        if (typeof params[1] === "number") kase.triage_minutes = params[1];
      }
    }
    return { rows: [] };
  }

  // Campaigns list
  if (sql.startsWith("SELECT * FROM campaigns")) {
    return { rows: Array.from(memoryStore.campaigns.values()) as unknown as T[] };
  }

  // Single campaign
  if (sql.includes("FROM campaigns WHERE id = $1")) {
    const campId = params?.[0];
    const camp = memoryStore.campaigns.get(campId);
    return { rows: camp ? ([camp] as unknown as T[]) : [] };
  }

  // Multi cases selection (campaigns array)
  if (sql.includes("FROM cases") && sql.includes("WHERE case_number = ANY($1)")) {
    const caseNumbers = (params?.[0] as string[]) || [];
    const foundCases = Array.from(memoryStore.cases.values())
      .filter((c) => caseNumbers.includes(c.case_number) || caseNumbers.includes(c.id))
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
    const currentIndicators = memoryStore.indicators.filter((i) => i.case_id === currentCaseId);
    if (currentIndicators.length === 0) return { rows: [] };

    const otherCaseMatches = new Map<string, Set<string>>();
    for (const ind of currentIndicators) {
      const matches = memoryStore.indicators.filter(
        (i) => i.type === ind.type && i.value === ind.value && i.case_id !== currentCaseId,
      );
      for (const m of matches) {
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
    } else if (sql.includes("WHERE id = $1")) {
      filter = { id: params?.[0] };
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
      const [name, trusted_domains, trusted_contacts, approved_bank_suffixes, normal_recipients] =
        params;
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
      await cols.vendors.insertOne({ ...newVendor, _id: id } as any);
      return [newVendor] as unknown as T[];
    }
    return [];
  }

  // 4. Update vendor
  if (sql.startsWith("UPDATE vendors SET")) {
    if (params) {
      const vendorId = params[params.length - 1];
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

      await cols.vendors.updateOne({ id: vendorId }, { $set: updateDoc });
      const updated = await cols.vendors.findOne({ id: vendorId });
      return updated ? ([updated] as unknown as T[]) : [];
    }
    return [];
  }

  // 5. Insert case
  if (sql.startsWith("INSERT INTO cases")) {
    if (params) {
      const [
        id,
        case_number,
        subject,
        sender,
        recipients,
        threat_class,
        risk_score,
        severity,
        confidence,
        decision,
        assigned_action,
        decision_banner,
        vendor_id,
        vendor_name,
        amount_at_risk,
        currency,
        body_preview,
        evidenceJson,
        timelineJson,
        relayPathJson,
        raw_eml,
        eml_sha256,
      ] = params;

      const caseDoc: any = {
        _id: id,
        id,
        case_number,
        subject,
        sender,
        recipients: recipients ?? [],
        threat_class,
        risk_score: Number(risk_score),
        severity,
        confidence: Number(confidence),
        decision: decision ?? "pending",
        assigned_action,
        decision_banner,
        vendor: vendor_name ?? "—",
        vendor_id,
        vendor_name,
        amount_at_risk: amount_at_risk ? Number(amount_at_risk) : undefined,
        currency,
        body_preview,
        evidence: typeof evidenceJson === "string" ? JSON.parse(evidenceJson) : evidenceJson,
        timeline: typeof timelineJson === "string" ? JSON.parse(timelineJson) : timelineJson,
        relay_path: typeof relayPathJson === "string" ? JSON.parse(relayPathJson) : relayPathJson,
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
    !sql.includes("WHERE")
  ) {
    const docs = await cols.cases.find({}).sort({ created_at: -1 }).toArray();
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
  if (sql.includes("FROM cases WHERE vendor_id = $1")) {
    const vendorId = params?.[0];
    const docs = await cols.cases
      .find({ vendor_id: vendorId })
      .sort({ created_at: -1 })
      .limit(20)
      .toArray();
    return docs.map((d) => ({
      id: d.id,
      body_preview: d.body_preview,
      send_hour: new Date(d.created_at).getUTCHours(),
    })) as unknown as T[];
  }

  if (sql.includes("FROM cases WHERE case_number = ANY($1)")) {
    const caseNumbers: string[] = params?.[0] ?? [];
    const docs = await cols.cases
      .find({ case_number: { $in: caseNumbers } })
      .sort({ created_at: -1 })
      .toArray();
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
    (sql.includes("c.id = $1") || sql.includes("case_number = $1") || sql.includes("id = $1"))
  ) {
    const idOrNum = params?.[0];
    const found = await cols.cases.findOne({
      $or: [{ id: idOrNum }, { case_number: idOrNum }, { _id: idOrNum }],
    });
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
        const id = params[4];
        const campaignGraph = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        await cols.cases.updateOne(
          { _id: id },
          {
            $set: {
              campaign_id: params[0],
              campaign_graph: campaignGraph,
              risk_score: params[2],
              confidence: params[3],
              updated_at: new Date().toISOString(),
            },
          },
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

  // 11. Campaigns
  if (sql.startsWith("SELECT * FROM campaigns")) {
    const camps = await cols.campaigns.find({}).sort({ last_seen: -1 }).toArray();
    return camps as unknown as T[];
  }

  if (sql.includes("FROM campaigns WHERE id = $1")) {
    const camp = await cols.campaigns.findOne({ id: params?.[0] });
    return camp ? ([camp] as unknown as T[]) : [];
  }

  if (sql.startsWith("INSERT INTO campaigns")) {
    if (params) {
      const [
        id,
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

      const campDoc: Campaign & { _id: string } = {
        _id: id,
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

  // 14. Behavioral checks queries
  if (sql.includes("evidence->'sender_identity'->>'reply_to'")) {
    const vendorId = params?.[0];
    const replyTos = await cols.cases.distinct("evidence.sender_identity.reply_to", {
      vendor_id: vendorId,
    });
    return replyTos.filter(Boolean).map((r) => ({ reply_to: r })) as unknown as T[];
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
