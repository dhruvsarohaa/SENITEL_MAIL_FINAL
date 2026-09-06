import { Pool } from "pg";
import type { VendorProfile, EvidenceSignal, Evidence, Severity } from "../types.js";

export interface BehavioralResult {
  signals: EvidenceSignal[];
  scoreDelta: number;
  vendorRelationship?: Evidence["vendor_relationship"];
  anomalies: { label: string; detail?: string; severity?: Severity; at?: string }[];
}

/**
 * Compare an incoming email against a vendor's trusted baseline and historical behavior.
 * Returns behavioral signals and a cumulative score adjustment.
 */
export async function compareBehavior(params: {
  pool: { query: <T = any>(text: string, params?: any[]) => Promise<{ rows: T[] }> };
  vendor: VendorProfile | null;
  senderAddress: string;
  senderDomain: string;
  replyTo: string;
  recipients: string[];
  bankAccountLast4?: string;
  bodyText: string;
  sentAt: Date;
}): Promise<BehavioralResult> {
  const result: BehavioralResult = { signals: [], scoreDelta: 0, anomalies: [] };
  if (!params.vendor) return result;

  const {
    pool,
    vendor,
    senderDomain,
    senderAddress,
    replyTo,
    recipients,
    bankAccountLast4,
    bodyText,
    sentAt,
  } = params;

  // 1. Domain match — is the sender domain in the vendor's trusted list?
  if (!vendor.trusted_domains.includes(senderDomain)) {
    result.scoreDelta += 22;
    result.signals.push({
      label: "Sender domain not in vendor baseline",
      detail: `${senderDomain} ∉ [${vendor.trusted_domains.join(", ")}]`,
      severity: "critical",
      weight: 0.22,
    });
    result.anomalies.push({
      label: "Domain mismatch",
      detail: `${senderDomain} is not a trusted domain for ${vendor.name}`,
      severity: "critical",
      at: new Date().toISOString(),
    });
  }

  // 2. Contact match — is the sender a known contact?
  if (vendor.trusted_contacts.length > 0 && !vendor.trusted_contacts.includes(senderAddress)) {
    result.scoreDelta += 12;
    result.signals.push({
      label: "Sender is not a known vendor contact",
      detail: senderAddress,
      severity: "high",
      weight: 0.12,
    });
    result.anomalies.push({
      label: "Unknown contact",
      detail: `${senderAddress} is not in the trusted contacts list`,
      severity: "high",
      at: new Date().toISOString(),
    });
  }

  // 3. Reply-To check — has this Reply-To ever been seen for this vendor?
  if (replyTo && replyTo !== senderAddress) {
    try {
      const pastReplyTos = await pool.query<{ reply_to: string }>(
        `SELECT DISTINCT evidence->'sender_identity'->>'reply_to' AS reply_to
         FROM cases WHERE vendor_id = $1 AND evidence->'sender_identity'->>'reply_to' IS NOT NULL`,
        [vendor.id],
      );
      const knownReplyTos = new Set(pastReplyTos.rows.map((r) => r.reply_to));
      if (knownReplyTos.size > 0 && !knownReplyTos.has(replyTo)) {
        result.scoreDelta += 18;
        result.signals.push({
          label: "Reply-To address never seen for this vendor",
          detail: replyTo,
          severity: "critical",
          weight: 0.18,
        });
        result.anomalies.push({
          label: "New Reply-To address",
          detail: `${replyTo} has not been used in prior communications`,
          severity: "critical",
          at: new Date().toISOString(),
        });
      }
    } catch {
      // Ignore if query fails completely
    }
  }

  // 4. Recipient pattern — are recipients in the vendor's normal list?
  if (vendor.normal_recipients.length > 0) {
    const unusual = recipients.filter((r) => !vendor.normal_recipients.includes(r.toLowerCase()));
    if (unusual.length > 0) {
      result.scoreDelta += 8;
      result.signals.push({
        label: "Email sent to unusual recipients",
        detail: unusual.join(", "),
        severity: "medium",
        weight: 0.08,
      });
      result.anomalies.push({
        label: "Unusual recipients",
        detail: `${unusual.length} recipient(s) outside normal pattern`,
        severity: "medium",
        at: new Date().toISOString(),
      });
    }
  }

  // 5. Bank account check — is the account suffix approved?
  if (
    bankAccountLast4 &&
    !vendor.approved_bank_suffixes.some((suffix) =>
      suffix.replace(/\D/g, "").endsWith(bankAccountLast4),
    )
  ) {
    result.scoreDelta += 28;
    result.signals.push({
      label: "Bank account not on approved list",
      detail: `••••${bankAccountLast4} ∉ [${vendor.approved_bank_suffixes.join(", ")}]`,
      severity: "critical",
      weight: 0.28,
    });
    result.anomalies.push({
      label: "Unknown bank account",
      detail: `Account ending ${bankAccountLast4} is not approved for ${vendor.name}`,
      severity: "critical",
      at: new Date().toISOString(),
    });
  }

  // 6. Writing style — simple TF-IDF cosine similarity against past vendor emails
  try {
    const pastBodies = await pool.query<{ body_preview: string }>(
      `SELECT body_preview FROM cases WHERE vendor_id = $1 AND body_preview IS NOT NULL ORDER BY created_at DESC LIMIT 10`,
      [vendor.id],
    );
    if (pastBodies.rows.length >= 2) {
      const pastCorpus = pastBodies.rows.map((r) => r.body_preview).join(" ");
      const similarity = cosineSimilarity(tokenize(bodyText), tokenize(pastCorpus));
      if (similarity < 0.3) {
        result.scoreDelta += 10;
        result.signals.push({
          label: "Writing style differs from vendor history",
          detail: `Similarity: ${(similarity * 100).toFixed(0)}%`,
          severity: "medium",
          weight: 0.1,
        });
        result.anomalies.push({
          label: "Writing style anomaly",
          detail: `Current email is ${(similarity * 100).toFixed(0)}% similar to past vendor communications`,
          severity: "medium",
          at: new Date().toISOString(),
        });
      }
    }
  } catch {
    /* Skip if query fails */
  }

  // 7. Send time — compare hour against vendor's historical pattern
  try {
    const pastHours = await pool.query<{ send_hour: number }>(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS send_hour FROM cases WHERE vendor_id = $1`,
      [vendor.id],
    );
    if (pastHours.rows.length >= 3) {
      const hours = pastHours.rows.map((r) => r.send_hour);
      // Determine average hour using circular mean
      let sinSum = 0,
        cosSum = 0;
      for (const h of hours) {
        const rad = (h / 24) * 2 * Math.PI;
        sinSum += Math.sin(rad);
        cosSum += Math.cos(rad);
      }
      let avgHour = (Math.atan2(sinSum / hours.length, cosSum / hours.length) * 24) / (2 * Math.PI);
      if (avgHour < 0) avgHour += 24;

      const currentHour = sentAt.getUTCHours();
      // Calculate shortest circular distance
      const diff = Math.abs(currentHour - avgHour);
      const circularDiff = Math.min(diff, 24 - diff);

      if (circularDiff > 6) {
        result.scoreDelta += 5;
        result.signals.push({
          label: "Email sent at unusual time for this vendor",
          detail: `Sent at ${currentHour}:00 UTC, vendor typically sends around ${Math.round(avgHour)}:00 UTC`,
          severity: "low",
          weight: 0.05,
        });
        result.anomalies.push({
          label: "Unusual send time",
          severity: "low",
          at: new Date().toISOString(),
        });
      }
    }
  } catch {
    /* Skip if query fails */
  }

  // Build the vendor relationship block for the evidence section
  result.vendorRelationship = {
    trusted_domain: vendor.trusted_domains[0] ?? senderDomain,
    known_contact: vendor.trusted_contacts[0] ?? "No known contact",
    approved_bank_suffixes: vendor.approved_bank_suffixes,
    normal_recipients: vendor.normal_recipients,
  };

  return result;
}

/** Tokenize text into lowercased word frequencies. */
function tokenize(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

/** Compute cosine similarity between two term-frequency vectors. */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (const [word, freqA] of a) {
    magA += freqA * freqA;
    const freqB = b.get(word) ?? 0;
    dot += freqA * freqB;
  }
  for (const freq of b.values()) magB += freq * freq;
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
