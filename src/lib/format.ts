import type { Severity, ThreatClass } from "@/types/sentinel";

export const threatLabels: Record<ThreatClass, string> = {
  invoice_fraud: "Invoice fraud",
  ceo_impersonation: "CEO impersonation",
  credential_phishing: "Credential phishing",
  malware_delivery: "Malware delivery",
  benign: "No threat found",
};

export const decisionLabels: Record<string, string> = {
  pending: "Pending review",
  safe: "Marked safe",
  payment_held: "Payment held",
  escalated: "Escalated",
  confirmed_threat: "Confirmed threat",
};

export function severityFromScore(score: number): Severity {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "safe";
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return iso;
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function formatCurrency(amount?: number, currency = "USD"): string {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Defensive: email content is only ever rendered as plain text. */
export function toPlainText(input?: string): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
