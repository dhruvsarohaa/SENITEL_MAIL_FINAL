import crypto from "node:crypto";
import { calculateShouldHold } from "./scoring.js";
import type {
  AuthResult,
  Case,
  EvidenceSignal,
  OriginAssessment,
  RelayHop,
  Severity,
  ThreatClass,
  VendorProfile,
  DomainIntelligence,
} from "../types.js";

import { enrichIp } from "./ip-intelligence.js";
import { enrichDomain } from "./domain-intelligence.js";

export type Headers = Map<string, string[]>;

type Attachment = {
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  suspicious: boolean;
};

const maxMessageBytes = 25 * 1024 * 1024;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;

export function splitMessage(raw: string) {
  const match = raw.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) return { headers: raw, body: "" };
  return { headers: raw.slice(0, match.index), body: raw.slice(match.index + match[0].length) };
}

export function parseHeaders(source: string): Headers {
  const headers = new Map<string, string[]>();
  let name = "";
  let value = "";
  const add = () => {
    if (!name) return;
    headers.set(name, [...(headers.get(name) ?? []), value.trim()]);
  };
  for (const line of source.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && name) {
      value += ` ${line.trim()}`;
      continue;
    }
    add();
    const separator = line.indexOf(":");
    name = separator === -1 ? "" : line.slice(0, separator).trim().toLowerCase();
    value = separator === -1 ? "" : line.slice(separator + 1).trim();
  }
  add();
  return headers;
}

function first(headers: Headers, name: string) {
  return headers.get(name.toLowerCase())?.[0] ?? "";
}

function all(headers: Headers, name: string) {
  return headers.get(name.toLowerCase()) ?? [];
}

export function address(value: string) {
  return value.match(emailPattern)?.[0].toLowerCase() ?? "";
}

export function domain(value: string) {
  return value.split("@")[1]?.toLowerCase() ?? "";
}

function mimeParameter(value: string, parameter: string) {
  const escaped = parameter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value
    .match(new RegExp(`(?:^|;)\\s*${escaped}\\*?=(?:UTF-8''|")?([^;"]+)`, "i"))?.[1]
    ?.trim();
}

function decodeQuotedPrintableBytes(source: string): Buffer {
  const withoutSoftBreaks = source.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < withoutSoftBreaks.length; index += 1) {
    const encoded = withoutSoftBreaks.slice(index + 1, index + 3);
    if (withoutSoftBreaks[index] === "=" && /^[\dA-F]{2}$/i.test(encoded)) {
      bytes.push(Number.parseInt(encoded, 16));
      index += 2;
    } else {
      bytes.push(withoutSoftBreaks.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function decodeQuotedPrintable(source: string): string {
  return decodeQuotedPrintableBytes(source).toString("utf-8");
}

function decodedBytes(source: string, encoding: string): Buffer {
  if (/base64/i.test(encoding)) {
    return Buffer.from(source.replace(/\s/g, ""), "base64");
  }
  if (/quoted-printable/i.test(encoding)) {
    return decodeQuotedPrintableBytes(source);
  }
  return Buffer.from(source, "utf-8");
}

async function getSha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function isDangerousAttachment(filename: string, mimeType: string) {
  return (
    /\.(?:exe|js|jse|vbs|vbe|bat|cmd|scr|ps1|iso|img|lnk)$/i.test(filename) ||
    /(?:x-msdownload|javascript|x-sh)/i.test(mimeType)
  );
}

async function parseMime(
  source: string,
  result: {
    text: string[];
    plainText: string[];
    htmlText: string[];
    attachments: Attachment[];
  },
): Promise<void> {
  const { headers: rawHeaders, body } = splitMessage(source);
  const headers = parseHeaders(rawHeaders);
  const contentType = first(headers, "content-type") || "text/plain";
  const boundary = mimeParameter(contentType, "boundary");
  if (/^multipart\//i.test(contentType) && boundary) {
    const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = body.split(new RegExp(`(?:^|\\r?\\n)--${escaped}(?:--)?(?:\\r?\\n|$)`));
    for (const part of parts.slice(1)) if (part.trim()) await parseMime(part, result);
    return;
  }

  const disposition = first(headers, "content-disposition");
  const filename = mimeParameter(disposition, "filename") ?? mimeParameter(contentType, "name");
  const bytes = decodedBytes(body, first(headers, "content-transfer-encoding"));
  if (filename || /attachment/i.test(disposition)) {
    let safeName: string = filename || "unnamed-attachment";
    try {
      if (filename) safeName = decodeURIComponent(filename) || "unnamed-attachment";
    } catch {
      safeName = filename || "unnamed-attachment"; // Keep raw filename if decode fails
    }
    const mimeType = contentType.split(";", 1)[0]!.trim().toLowerCase();
    result.attachments.push({
      filename: safeName,
      mime_type: mimeType,
      size_bytes: bytes.length,
      sha256: await getSha256(bytes),
      suspicious: isDangerousAttachment(safeName, mimeType),
    });
    return;
  }
  if (/^text\/plain/i.test(contentType)) {
    result.plainText.push(bytes.toString("utf-8"));
  } else if (/^text\/html/i.test(contentType)) {
    const content = bytes.toString("utf-8");
    result.htmlText.push(
      content.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, " "),
    );
  } else if (/^text\//i.test(contentType)) {
    result.text.push(bytes.toString("utf-8"));
  }
}

function auth(headers: Headers, method: "spf" | "dkim" | "dmarc") {
  const result = all(headers, "authentication-results")
    .join(" ")
    .match(new RegExp(`\\b${method}=(pass|fail|softfail|neutral|none)\\b`, "i"))?.[1]
    ?.toLowerCase();
  if (method === "spf")
    return result === "pass" || result === "fail" || result === "softfail" || result === "neutral"
      ? result
      : "none";
  return result === "pass" || result === "fail" ? result : "none";
}

async function relays(headers: Headers): Promise<RelayHop[]> {
  const hops = all(headers, "received")
    .slice(0, 8)
    .map((entry, index) => {
      const receivedAt = entry.split(";").at(-1)?.trim();
      const timestamp =
        receivedAt && !Number.isNaN(Date.parse(receivedAt))
          ? new Date(receivedAt).toISOString()
          : undefined;
      return {
        index: index + 1,
        host: entry.match(/\bfrom\s+([^\s(]+)/i)?.[1] ?? "Unspecified relay",
        ip: entry.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0] ?? "—",
        ...(timestamp ? { timestamp } : {}),
      };
    });

  for (const hop of hops) {
    if (hop.ip !== "—") {
      const intelligence = await enrichIp(hop.ip);
      if (intelligence) {
        Object.assign(hop, intelligence);
      }
    }
  }

  return hops;
}

export function classifyRules(
  text: string,
  attachments: { filename: string; suspicious: boolean }[],
): ThreatClass {
  const value = text.toLowerCase();
  if (attachments.some((attachment) => attachment.suspicious)) return "malware_delivery";
  if (
    /\b(password|sign[ -]?in|login|verify (your )?account|mailbox.{0,30}(quota|full))\b/.test(value)
  )
    return "credential_phishing";
  if (
    /\b(ceo|board).{0,120}\b(wire|transfer|payment)\b|\b(wire|transfer).{0,120}\b(confidential|board|do not)\b/.test(
      value,
    )
  )
    return "ceo_impersonation";
  if (
    /\b(invoice|remittance|beneficiary|bank details?|payment instructions?|account).{0,100}\b(change|updated|new|wire|transfer|payment)\b/.test(
      value,
    )
  )
    return "invoice_fraud";
  return "benign";
}

function severity(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return score > 0 ? "low" : "safe";
}

function financial(text: string) {
  const paymentChange =
    /\b(update(?:d)?|new|amended|change(?:d)?).{0,50}\b(bank|account|beneficiary|payment|remittance)|\b(bank|account|beneficiary).{0,50}\b(update(?:d)?|new|amended|change(?:d)?)\b/i.test(
      text,
    );
  const account =
    text
      .match(
        /\b(?:iban|bank account|account(?: number)?|acct)\s*(?:no\.?|number)?\s*(?::|#|-|\s+)\s*([A-Z]{2}\d[A-Z0-9 -]{6,32}|\d[\d -]{5,34})\b/i,
      )?.[1]
      ?.replace(/[^A-Z0-9]/gi, "") ?? "";
  const amountMatch = text.match(/(USD|\$|€|£|EUR|GBP)\s?([\d,]+(?:\.\d{2})?)/);
  const amount = amountMatch?.[2]?.replace(/,/g, "");

  let currencyCode = "USD";
  if (amountMatch?.[1]) {
    const symbol = amountMatch[1];
    if (symbol === "€" || symbol === "EUR") currencyCode = "EUR";
    else if (symbol === "£" || symbol === "GBP") currencyCode = "GBP";
  }

  return {
    paymentChange,
    accountLast4: account.length >= 4 ? account.slice(-4) : undefined,
    beneficiary: text
      .match(/\bbeneficiary\s*[:-]\s*([^\n]{2,80})/i)?.[1]
      ?.split(/[.\r\n]/, 1)[0]
      ?.trim(),
    amount: amount ? Number(amount) : undefined,
    currency: currencyCode,
  };
}

function assessOrigin(
  authResults: AuthResult,
  from: string,
  replyTo: string,
  returnPath: string,
  domainMatches: boolean,
  relayPath: RelayHop[],
  threatClass: ThreatClass,
  hasPaymentChange: boolean,
  attachments: Attachment[],
): OriginAssessment {
  const reasons: string[] = [];
  const hasDmarcFail = authResults.dmarc === "fail";
  const hasAuthFail =
    authResults.spf === "fail" || authResults.dkim === "fail" || authResults.spf === "softfail";
  const replyToMismatch = Boolean(replyTo && replyTo !== from);
  const returnPathMismatch = Boolean(
    returnPath &&
    returnPath !== from &&
    from.length > 0 &&
    returnPath.length > 0 &&
    domain(returnPath) !== domain(from),
  );

  // 1. Spoofed Domain
  if ((hasDmarcFail && !domainMatches) || (returnPathMismatch && hasAuthFail)) {
    if (hasDmarcFail) reasons.push("DMARC authentication failure");
    if (hasAuthFail) reasons.push("SPF/DKIM authentication failure");
    if (returnPathMismatch) reasons.push("From vs Return-Path domain mismatch");
    if (!domainMatches) reasons.push("Suspicious From-domain alignment");

    return {
      assessment: "Spoofed Domain",
      confidence: reasons.length >= 3 ? 92 : 82,
      reasons,
    };
  }

  // 2. Likely Anonymized Infrastructure
  const anonymizedHops = relayPath.filter((h) => h.isVpn || h.isTor || h.isProxy);
  if (anonymizedHops.length > 0) {
    if (anonymizedHops.some((h) => h.isTor)) reasons.push("Email routed through TOR network");
    if (anonymizedHops.some((h) => h.isVpn))
      reasons.push("Email routed through known VPN exit node");
    if (anonymizedHops.some((h) => h.isProxy))
      reasons.push("Email routed through known proxy infrastructure");

    return {
      assessment: "Likely Anonymized Infrastructure",
      confidence: reasons.length > 1 ? 95 : 85,
      reasons,
    };
  }

  // 3. Likely Compromised Account
  const isAuthPass = authResults.spf === "pass" && authResults.dkim === "pass";
  if (
    isAuthPass &&
    domainMatches &&
    (hasPaymentChange || threatClass !== "benign" || replyToMismatch)
  ) {
    reasons.push("SPF/DKIM/DMARC authentication passes for trusted vendor domain");
    if (hasPaymentChange) reasons.push("High-risk BEC/payment-change behavior detected");
    if (threatClass !== "benign") reasons.push(`Behavioral anomaly detected (${threatClass})`);
    if (replyToMismatch) reasons.push("Suspicious external Reply-To redirection");

    return {
      assessment: "Likely Compromised Account",
      confidence: reasons.length >= 3 ? 88 : 76,
      reasons,
    };
  }

  // 4. Likely Malicious Infrastructure
  const hasMaliciousPayload =
    attachments.some((a) => a.suspicious) ||
    threatClass === "malware_delivery" ||
    threatClass === "credential_phishing";
  const untrustedHops = relayPath.filter((h) => h.isHosting && !domainMatches);

  if (hasMaliciousPayload && untrustedHops.length > 0) {
    if (untrustedHops.length > 0)
      reasons.push("Email originated from cloud/hosting infrastructure");
    if (!domainMatches) reasons.push("Infrastructure does not match vendor profile");
    if (attachments.some((a) => a.suspicious)) reasons.push("Suspicious attachment detected");
    if (threatClass !== "benign") reasons.push("Existing high-risk classification");

    return {
      assessment: "Likely Malicious Infrastructure",
      confidence: reasons.length >= 3 ? 85 : 75,
      reasons,
    };
  }

  return {
    assessment: "Insufficient Evidence",
    confidence: 0,
    reasons: [],
  };
}

export async function analyzeEml(input: {
  bytes: Buffer;
  filename: string;
  vendors: VendorProfile[];
  vendorId?: string;
  caseNumber: string;
}): Promise<Case> {
  if (!input.bytes.length) throw new Error("The uploaded .eml file is empty.");
  if (input.bytes.length > maxMessageBytes)
    throw new Error("The uploaded .eml file exceeds the 25 MB limit.");
  const raw = input.bytes.toString("utf-8");
  const envelope = splitMessage(raw);
  const headers = parseHeaders(envelope.headers);
  const mime = {
    text: [] as string[],
    plainText: [] as string[],
    htmlText: [] as string[],
    attachments: [] as Attachment[],
  };
  await parseMime(raw, mime);
  const selectedText =
    mime.plainText.length > 0
      ? mime.plainText.join("\n\n")
      : mime.htmlText.length > 0
        ? mime.htmlText.join("\n\n")
        : mime.text.join("\n\n");
  const body = selectedText.replace(/\s{3,}/g, " ").trim() || envelope.body.trim();
  const fromRaw = first(headers, "from") || "";
  const displayMatch = fromRaw.match(/^"?([^"<]+)"?\s*<.+>$/);
  const displayName = displayMatch
    ? displayMatch[1]?.trim().replace(/^["']|["']$/g, "")
    : undefined;
  const from = address(fromRaw);
  const replyTo = address(first(headers, "reply-to"));
  const returnPath = address(first(headers, "return-path"));
  const senderDomain = domain(from);
  const vendor =
    input.vendors.find((item) => item.id === input.vendorId) ??
    input.vendors.find((item) => item.trusted_domains.includes(senderDomain)) ??
    input.vendors.find((item) =>
      item.trusted_domains.some((d) => senderDomain.includes(d.split(".")[0] || "___")),
    );
  const authResults: AuthResult = {
    spf: auth(headers, "spf") as AuthResult["spf"],
    dkim: auth(headers, "dkim") as AuthResult["dkim"],
    dmarc: auth(headers, "dmarc") as AuthResult["dmarc"],
  };
  const financialDetails = financial(body);
  const threatClass = classifyRules(`${first(headers, "subject")}\n${body}`, mime.attachments);
  const signals: EvidenceSignal[] = [];
  let score = threatClass === "benign" ? 0 : 18;
  if (threatClass !== "benign")
    signals.push({
      label: `Message intent: ${threatClass.replace(/_/g, " ")}`,
      severity: "high",
      weight: 0.18,
    });
  if (financialDetails.paymentChange) {
    score += 28;
    signals.push({
      label: "Payment or beneficiary change requested",
      severity: "critical",
      weight: 0.28,
    });
  }
  if (financialDetails.accountLast4) {
    score += 16;
    signals.push({
      label: `Bank account detected ending ${financialDetails.accountLast4}`,
      severity: "high",
      weight: 0.16,
    });
  }
  if (replyTo && replyTo !== from) {
    score += 20;
    signals.push({ label: "Reply-To differs from sender", severity: "critical", weight: 0.2 });
  }
  const failedAuth = Object.entries(authResults).filter(
    ([, result]) => result === "fail" || result === "softfail",
  );
  if (failedAuth.length) {
    score += failedAuth.length * 10;
    signals.push({
      label: `${failedAuth.map(([name]) => name.toUpperCase()).join(", ")} authentication failure`,
      severity: "high",
      weight: 0.14,
    });
  }
  if (mime.attachments.some((attachment) => attachment.suspicious)) {
    score += 30;
    signals.push({
      label: "Executable or script attachment detected",
      severity: "critical",
      weight: 0.3,
    });
  }
  const domainMatches = Boolean(vendor && vendor.trusted_domains.includes(senderDomain));
  if (vendor && !domainMatches) {
    score += 22;
    signals.push({
      label: "Sender domain differs from selected vendor baseline",
      severity: "critical",
      weight: 0.22,
    });
  }
  const bankKnown =
    vendor && financialDetails.accountLast4
      ? vendor.approved_bank_suffixes.some((suffix) =>
          suffix.replace(/\D/g, "").endsWith(financialDetails.accountLast4!),
        )
      : undefined;
  if (vendor && financialDetails.accountLast4 && !bankKnown) {
    score += 28;
    signals.push({
      label: "Bank account is not approved for this vendor",
      severity: "critical",
      weight: 0.28,
    });
  }
  score = Math.min(99, score);
  const riskSeverity = severity(score);
  const urls = [
    ...new Set(body.match(urlPattern)?.map((item) => item.replace(/[.,;:]+$/, "")) ?? []),
  ];
  const domains = [
    ...new Set(
      [
        senderDomain,
        replyTo ? domain(replyTo) : "",
        ...urls.map((item) => {
          try {
            return new URL(item).hostname.toLowerCase();
          } catch {
            return "";
          }
        }),
      ].filter(Boolean),
    ),
  ];

  const returnPathDomain = returnPath ? domain(returnPath) : "";
  const candidateDomains = [
    senderDomain,
    returnPathDomain,
    replyTo ? domain(replyTo) : "",
    ...domains,
  ].filter(Boolean);

  const uniqueDomainsToEnrich = [...new Set(candidateDomains)].slice(0, 5);

  const domainIntelligencePromises = await Promise.allSettled(
    uniqueDomainsToEnrich.map((d) => enrichDomain(d)),
  );

  const domainIntelligence = domainIntelligencePromises
    .map((r) => (r.status === "fulfilled" ? r.value : undefined))
    .filter(Boolean) as DomainIntelligence[];

  const relayPath = await relays(headers);
  const confidence = Math.max(0.35, Math.min(0.98, 0.5 + score / 200));
  const shouldHold = calculateShouldHold({
    threatClass,
    hasPaymentChange: financialDetails.paymentChange,
    hasBankAccount: Boolean(financialDetails.accountLast4),
    riskScore: score,
  });

  const financialNotes: { label: string; severity: Severity }[] = [];
  if (financialDetails.accountLast4) {
    if (bankKnown === false) {
      financialNotes.push({
        label: "Beneficiary bank account suffix does not match approved vendor list",
        severity: "critical",
      });
    } else if (bankKnown === true) {
      financialNotes.push({
        label: "Bank account suffix matches approved vendor records",
        severity: "safe",
      });
    } else {
      financialNotes.push({
        label: "Bank account requires out-of-band vendor verification",
        severity: "high",
      });
    }
  }
  if (financialDetails.paymentChange) {
    financialNotes.push({
      label: "Urgent remittance destination update requested in email body",
      severity: "critical",
    });
  }

  const senderNotes: { label: string; severity: Severity }[] = [
    { label: "Authentication results parsed from Authentication-Results headers", severity: "low" },
  ];
  if (replyTo && replyTo !== from) {
    senderNotes.push({ label: "Reply-To differs from From address", severity: "critical" });
  }
  if (vendor && !domainMatches) {
    senderNotes.push({
      label: "Sending domain differs from registered vendor domain",
      severity: "critical",
    });
  }

  const originAssessment = assessOrigin(
    authResults,
    from || fromRaw,
    replyTo,
    returnPath,
    domainMatches,
    relayPath,
    threatClass,
    financialDetails.paymentChange,
    mime.attachments,
  );

  return {
    id: crypto.randomUUID(),
    case_number: input.caseNumber,
    subject: first(headers, "subject") || input.filename,
    sender: from || fromRaw || "Unknown sender",
    threat_class: threatClass,
    risk_score: score,
    severity: riskSeverity,
    decision: "pending",
    assigned_action: shouldHold ? "Hold payment" : "Review required",
    vendor: vendor?.name ?? "—",
    ...(financialDetails.amount
      ? { amount_at_risk: financialDetails.amount, currency: financialDetails.currency }
      : {}),
    created_at: new Date().toISOString(),
    confidence,
    decision_banner: shouldHold
      ? "Hold payment recommended — payment-change evidence requires out-of-band verification"
      : riskSeverity === "safe"
        ? "No high-risk indicators found in the uploaded email"
        : "Review required — investigate the evidence before acting",
    recipients: all(headers, "to").flatMap(
      (value) => value.match(new RegExp(emailPattern, "gi")) ?? [],
    ),
    body_preview: body.slice(0, 12_000),
    evidence: {
      intent: { classification: threatClass, model_confidence: confidence, signals },
      sender_identity: {
        from_address: from || fromRaw || "Unknown sender",
        ...(displayName ? { display_name: displayName } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(returnPath ? { return_path: returnPath } : {}),
        auth: authResults,
        ...(vendor ? { trusted_vendor: vendor.name, vendor_domain_match: domainMatches } : {}),
        notes: senderNotes,
      },
      financial: {
        ...(financialDetails.amount
          ? {
              invoice_amount: financialDetails.amount,
              currency: financialDetails.currency || "USD",
            }
          : {}),
        ...(financialDetails.accountLast4
          ? {
              bank_account_last4: financialDetails.accountLast4,
              bank_account_known: bankKnown ?? false,
            }
          : {}),
        payment_change_requested: financialDetails.paymentChange,
        ...(financialDetails.beneficiary ? { beneficiary: financialDetails.beneficiary } : {}),
        notes: financialNotes,
      },
      technical: {
        urls,
        domains,
        relay_ips: relayPath.map((hop) => hop.ip).filter((ip) => ip !== "—"),
        attachments: mime.attachments,
      },
      ...(vendor
        ? {
            vendor_relationship: {
              trusted_domain: vendor.trusted_domains[0] ?? senderDomain,
              known_contact: vendor.trusted_contacts[0] ?? (from || "No known contact"),
              approved_bank_suffixes: vendor.approved_bank_suffixes,
              normal_recipients: vendor.normal_recipients,
            },
          }
        : {}),
    },
    timeline: signals.map((signal, index) => ({
      order: index + 1,
      title: signal.label,
      description:
        "Extracted from the uploaded email and evaluated against the available vendor baseline.",
      severity: signal.severity ?? "medium",
      ...(signal.weight === undefined ? {} : { weight: signal.weight }),
    })),
    origin_assessment: originAssessment,
    domain_intelligence: domainIntelligence.length > 0 ? domainIntelligence : undefined,
    relay_path: relayPath,
    actions: [],
  };
}
