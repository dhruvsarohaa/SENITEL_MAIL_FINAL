import { Pool } from "pg";
import crypto from "node:crypto";
import type { CampaignGraphData, GraphNode, GraphEdge } from "../types.js";

export interface CampaignCorrelationResult {
  campaignId: string | null;
  matchCount: number;
  campaignGraph?: CampaignGraphData;
}

interface IndicatorRow {
  case_id: string;
  type: string;
  value: string;
}

/**
 * Extract IOCs from a case and correlate with existing cases.
 * If ≥2 indicators of different types match another case, create or update a campaign.
 */
export interface QueryableClient {
  query: <T = any>(text: string, params?: any[]) => Promise<{ rows: T[] }>;
  release?: () => void;
}

export async function extractAndCorrelate(params: {
  pool: {
    query: <T = any>(text: string, params?: any[]) => Promise<{ rows: T[] }>;
    connect: () => Promise<QueryableClient>;
  };
  caseId: string;
  caseNumber: string;
  domains: string[];
  urls: string[];
  replyTo: string;
  bankAccountLast4?: string;
  attachmentHashes: string[];
  relayIps: string[];
}): Promise<CampaignCorrelationResult> {
  const { pool, caseId, domains, urls, replyTo, bankAccountLast4, attachmentHashes, relayIps } =
    params;

  // 1. Insert IOCs into the indicators table
  const indicators: { type: string; value: string }[] = [];
  for (const d of domains) indicators.push({ type: "domain", value: d });
  for (const u of urls) indicators.push({ type: "url", value: u });
  if (replyTo) indicators.push({ type: "reply_to", value: replyTo });
  if (bankAccountLast4) indicators.push({ type: "bank_account", value: bankAccountLast4 });
  for (const h of attachmentHashes) indicators.push({ type: "attachment_hash", value: h });
  for (const ip of relayIps)
    if (ip !== "—" && !ip.startsWith("10.")) indicators.push({ type: "ip", value: ip });

  if (indicators.length === 0) {
    return { campaignId: null, matchCount: 0 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert indicators for this case
    for (const ind of indicators) {
      await client.query(
        "INSERT INTO indicators (case_id, type, value) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [caseId, ind.type, ind.value],
      );
    }

    // 2. Find other cases sharing indicators with this case
    // Group by case_id, count distinct indicator types that match
    const matchQuery = await client.query<{
      other_case_id: string;
      match_types: number;
      shared: string[];
    }>(
      `SELECT i2.case_id AS other_case_id,
              COUNT(DISTINCT i2.type) AS match_types,
              ARRAY_AGG(DISTINCT i2.type || ':' || i2.value) AS shared
       FROM indicators i1
       JOIN indicators i2 ON i1.type = i2.type AND i1.value = i2.value AND i1.case_id != i2.case_id
       WHERE i1.case_id = $1
       GROUP BY i2.case_id
       HAVING COUNT(DISTINCT i2.type) >= 2
       ORDER BY COUNT(DISTINCT i2.type) DESC`,
      [caseId],
    );

    if (matchQuery.rows.length === 0) {
      await client.query("COMMIT");
      return { campaignId: null, matchCount: 0 };
    }

    // 3. Build or join a campaign
    const matchedCaseIds = matchQuery.rows.map((r: any) => r.other_case_id as string);
    const allCaseIds = [caseId, ...matchedCaseIds];
    const totalMatches = matchQuery.rows.reduce(
      (sum: number, r: any) => sum + Number(r.match_types),
      0,
    );

    // Check if any matched case already belongs to a campaign
    const existingCampaign = await client.query<{ campaign_id: string }>(
      `SELECT campaign_id FROM cases WHERE id = ANY($1) AND campaign_id IS NOT NULL LIMIT 1`,
      [matchedCaseIds],
    );

    let campaignId: string;
    const sharedIndicators: string[] = [
      ...new Set(matchQuery.rows.flatMap((r: any) => (r.shared ?? []) as string[])),
    ];
    const sharedDomains = sharedIndicators
      .filter((s: string) => s.startsWith("domain:"))
      .map((s: string) => s.split(":").slice(1).join(":"));
    const sharedReplyTos = sharedIndicators
      .filter((s: string) => s.startsWith("reply_to:"))
      .map((s: string) => s.split(":").slice(1).join(":"));
    const sharedBankAccounts = sharedIndicators
      .filter((s: string) => s.startsWith("bank_account:"))
      .map((s: string) => "••••" + s.split(":")[1]);
    const sharedAttachmentHashes = sharedIndicators
      .filter((s: string) => s.startsWith("attachment_hash:"))
      .map((s: string) => s.split(":").slice(1).join(":").slice(0, 12) + "…");

    // Determine the highest severity among all cases in the cluster
    const severityQuery = await client.query<{ severity: string }>(
      `SELECT severity FROM cases WHERE id = ANY($1) ORDER BY risk_score DESC LIMIT 1`,
      [allCaseIds],
    );
    const clusterSeverity = severityQuery.rows[0]?.severity ?? "high";

    // Get case numbers for naming
    const caseNumbersQuery = await client.query<{ case_number: string }>(
      `SELECT case_number FROM cases WHERE id = ANY($1) ORDER BY created_at`,
      [allCaseIds],
    );
    const caseNumbers = caseNumbersQuery.rows.map((r: any) => r.case_number as string);

    if (existingCampaign.rows[0]) {
      campaignId = existingCampaign.rows[0].campaign_id;
      // Update the existing campaign
      await client.query(
        `UPDATE campaigns SET
           case_ids = $1,
           shared_indicators = $2,
           last_seen = now(),
           severity = $3,
           case_count = $4,
           domains = $5,
           reply_tos = $6,
           bank_accounts = $7,
           attachment_hashes = $8,
           updated_at = now()
         WHERE id = $9`,
        [
          caseNumbers,
          sharedIndicators.map((s: string) => s.split(":").slice(1).join(":")),
          clusterSeverity,
          allCaseIds.length,
          sharedDomains,
          sharedReplyTos,
          sharedBankAccounts,
          sharedAttachmentHashes,
          campaignId,
        ],
      );
    } else {
      campaignId = `camp-${crypto.randomUUID().slice(0, 8)}`;
      const campaignName =
        sharedDomains.length > 0
          ? `${sharedDomains[0]} cluster`
          : `Campaign ${campaignId.slice(5)}`;
      await client.query(
        `INSERT INTO campaigns (id, name, severity, shared_indicators, first_seen, last_seen,
           case_ids, case_count, domains, reply_tos, bank_accounts, attachment_hashes, recommended_actions)
         VALUES ($1, $2, $3, $4, now(), now(), $5, $6, $7, $8, $9, $10, $11)`,
        [
          campaignId,
          campaignName,
          clusterSeverity,
          sharedIndicators.map((s: string) => s.split(":").slice(1).join(":")),
          caseNumbers,
          allCaseIds.length,
          sharedDomains,
          sharedReplyTos,
          sharedBankAccounts,
          sharedAttachmentHashes,
          ["Review all linked cases for coordinated attack indicators"],
        ],
      );
    }

    // Update all cases in the cluster with the campaign_id
    await client.query(`UPDATE cases SET campaign_id = $1, updated_at = now() WHERE id = ANY($2)`, [
      campaignId,
      allCaseIds,
    ]);

    // 4. Generate campaign graph
    const campaignGraph = buildCampaignGraph(caseNumbers, sharedIndicators);

    // Store the graph on each case in the cluster
    await client.query(
      `UPDATE cases SET campaign_graph = $1, updated_at = now() WHERE id = ANY($2)`,
      [JSON.stringify(campaignGraph), allCaseIds],
    );

    await client.query("COMMIT");

    return {
      campaignId,
      matchCount: totalMatches,
      campaignGraph,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Campaign correlation failed:", error);
    return { campaignId: null, matchCount: 0 };
  } finally {
    client.release?.();
  }
}

/** Build a visual graph of cases and their shared IOCs. */
function buildCampaignGraph(caseNumbers: string[], sharedIndicators: string[]): CampaignGraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Add case nodes
  for (const cn of caseNumbers) {
    nodes.push({ id: `case-${cn}`, label: cn, type: "email" });
  }

  // Add indicator nodes and edges
  const seen = new Set<string>();
  for (const indicator of sharedIndicators) {
    const [type, ...rest] = indicator.split(":");
    const value = rest.join(":");
    const nodeId = `ind-${type}-${value}`.replace(/[^a-zA-Z0-9-]/g, "_");

    if (!seen.has(nodeId)) {
      seen.add(nodeId);
      const graphType = (
        type === "domain"
          ? "domain"
          : type === "url"
            ? "url"
            : type === "reply_to"
              ? "reply_to"
              : type === "bank_account"
                ? "bank_account"
                : type === "attachment_hash"
                  ? "attachment"
                  : "domain"
      ) as GraphNode["type"];
      const label =
        type === "bank_account"
          ? `••••${value}`
          : value.length > 30
            ? value.slice(0, 29) + "…"
            : value;
      nodes.push({ id: nodeId, label, type: graphType, suspicious: true });
    }

    // Connect all cases to this indicator
    for (const cn of caseNumbers) {
      edges.push({ source: `case-${cn}`, target: nodeId, suspicious: true });
    }
  }

  return { nodes, edges };
}
