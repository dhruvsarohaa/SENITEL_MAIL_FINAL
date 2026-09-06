import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { CaseSummary } from "@/types/sentinel";
import { RiskBadge, StatusPill, severityDot } from "./RiskBadge";
import { formatCurrency, relativeTime, threatLabels } from "@/lib/format";
import { VendorHoverCard } from "./VendorHoverCard";
import { cn } from "@/lib/utils";

export type CaseColumn =
  | "risk"
  | "case"
  | "sender"
  | "subject"
  | "threat"
  | "vendor"
  | "amount"
  | "action"
  | "status"
  | "time"
  | "open";

const defaultColumns: CaseColumn[] = ["risk", "case", "subject", "threat", "amount", "time"];

const colWidths: Partial<Record<CaseColumn, number>> = {
  risk: 96,
  case: 74,
  sender: 180,
  threat: 124,
  vendor: 126,
  amount: 86,
  status: 120,
  time: 70,
  open: 40,
};

const headings: Record<CaseColumn, string> = {
  risk: "Risk",
  case: "Case",
  sender: "Sender",
  subject: "Subject",
  threat: "Threat",
  vendor: "Vendor",
  amount: "At risk",
  action: "Action",
  status: "Status",
  time: "Seen",
  open: "",
};

export function CaseTable({
  cases,
  columns = defaultColumns,
  selectedId,
  onSelect,
  stickyHeader,
}: {
  cases: CaseSummary[];
  columns?: CaseColumn[];
  selectedId?: string | null;
  onSelect?: (c: CaseSummary) => void;
  stickyHeader?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] table-fixed border-collapse text-xs">
        <colgroup>
          <col style={{ width: 3 }} />
          {columns.map((col) => (
            <col key={col} style={colWidths[col] ? { width: colWidths[col] } : {}} />
          ))}
        </colgroup>
        <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
          <tr className="border-b border-border bg-[var(--sunken)] text-left">
            <th className="w-[3px] p-0" aria-hidden />
            {columns.map((col) => (
              <th
                key={col}
                scope="col"
                className={cn(
                  "px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  (col === "amount" || col === "time" || col === "open") && "text-right",
                )}
              >
                {headings[col]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const selected = selectedId === c.id;
            return (
              <tr
                key={c.id}
                onClick={onSelect ? () => onSelect(c) : undefined}
                className={cn(
                  "border-b border-border/60 transition-colors duration-150 last:border-0",
                  onSelect && "cursor-pointer",
                  selected ? "bg-primary/8" : "hover:bg-[var(--sunken)]",
                )}
              >
                <td className={cn("w-[3px] p-0", severityDot[c.severity])} aria-hidden />
                {columns.map((col) => (
                  <td
                    key={col}
                    className={cn(
                      "truncate px-3.5 py-3 align-middle text-xs",
                      (col === "amount" || col === "time" || col === "open") && "text-right",
                    )}
                  >
                    {col === "risk" && <RiskBadge severity={c.severity} score={c.risk_score} />}
                    {col === "case" && (
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.id }}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {c.case_number}
                      </Link>
                    )}
                    {col === "sender" && (
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {c.sender}
                      </span>
                    )}
                    {col === "subject" && (
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.id }}
                        onClick={(e) => e.stopPropagation()}
                        className="line-clamp-1 max-w-[340px] text-xs font-semibold text-foreground hover:text-primary"
                      >
                        {c.subject}
                      </Link>
                    )}
                    {col === "threat" && (
                      <span className="whitespace-nowrap font-medium text-foreground/90">
                        {threatLabels[c.threat_class]}
                      </span>
                    )}
                    {col === "vendor" &&
                      (c.vendor ? (
                        <VendorHoverCard vendorName={c.vendor}>
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-foreground/90 hover:text-foreground hover:underline cursor-pointer">
                            {c.vendor}
                          </span>
                        </VendorHoverCard>
                      ) : (
                        <span className="whitespace-nowrap text-muted-foreground">—</span>
                      ))}
                    {col === "amount" && (
                      <span
                        className={cn(
                          "font-mono text-xs font-bold tabular-nums whitespace-nowrap",
                          c.amount_at_risk
                            ? "text-foreground"
                            : "text-muted-foreground font-normal",
                        )}
                      >
                        {c.amount_at_risk
                          ? formatCurrency(c.amount_at_risk, c.currency ?? "USD")
                          : "—"}
                      </span>
                    )}
                    {col === "action" && (
                      <span className="font-medium text-muted-foreground">
                        {c.assigned_action || "—"}
                      </span>
                    )}
                    {col === "status" && <StatusPill decision={c.decision} />}
                    {col === "open" && (
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.id }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Open case ${c.case_number}`}
                        className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:border-primary/40 hover:text-primary"
                      >
                        <ChevronRight className="size-3.5" aria-hidden />
                      </Link>
                    )}
                    {col === "time" && (
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {relativeTime(c.created_at)}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
