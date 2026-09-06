import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { AnalystDecision, Severity } from "@/types/sentinel";
import { cn } from "@/lib/utils";

const styles: Record<Severity, string> = {
  critical: "bg-critical/12 text-critical border-critical/30",
  high: "bg-warning/12 text-warning border-warning/30",
  medium: "bg-warning/8 text-warning/90 border-warning/20",
  low: "bg-primary/10 text-primary border-primary/25",
  safe: "bg-safe/12 text-safe border-safe/30",
};

const labels: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  safe: "Safe",
};

const icons: Record<Severity, typeof Info> = {
  critical: AlertOctagon,
  high: ShieldAlert,
  medium: AlertTriangle,
  low: Info,
  safe: CheckCircle2,
};

export const severityDot: Record<Severity, string> = {
  critical: "bg-critical",
  high: "bg-warning",
  medium: "bg-warning/70",
  low: "bg-primary",
  safe: "bg-safe",
};

export function RiskBadge({
  severity,
  score,
  className,
}: {
  severity: Severity;
  score?: number;
  className?: string;
}) {
  const Icon = icons[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[4px] text-[11px] font-semibold tracking-tight",
        styles[severity],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {labels[severity]}
      {score !== undefined && (
        <span className="font-mono text-[11px] font-semibold opacity-90">{score}</span>
      )}
    </span>
  );
}

const decisionStyles: Record<AnalystDecision, string> = {
  pending: "border-border-strong text-muted-foreground",
  safe: "border-safe/30 text-safe bg-safe/8",
  payment_held: "border-warning/30 text-warning bg-warning/8",
  escalated: "border-primary/30 text-primary bg-primary/8",
  confirmed_threat: "border-critical/30 text-critical bg-critical/8",
};

const decisionText: Record<AnalystDecision, string> = {
  pending: "Awaiting decision",
  safe: "Marked safe",
  payment_held: "Payment held",
  escalated: "Escalated",
  confirmed_threat: "Confirmed threat",
};

export function StatusPill({
  decision,
  className,
}: {
  decision: AnalystDecision;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[4px] text-[11px] font-semibold whitespace-nowrap",
        decisionStyles[decision] ?? decisionStyles.pending,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {decisionText[decision] ?? decision}
    </span>
  );
}

export function ConfidencePill({
  level,
}: {
  level: "Confirmed" | "Strong signal" | "Contextual signal";
}) {
  const tone =
    level === "Confirmed"
      ? "border-critical/30 text-critical bg-critical/8"
      : level === "Strong signal"
        ? "border-warning/30 text-warning bg-warning/8"
        : "border-border-strong text-muted-foreground";
  return (
    <span
      className={cn("rounded border px-1.5 py-[1px] text-[10px] font-medium tracking-tight", tone)}
    >
      {level}
    </span>
  );
}
