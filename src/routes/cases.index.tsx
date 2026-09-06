import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSearch } from "lucide-react";
import {
  AppShell,
  ConnectionNotice,
  EmptyState,
  PageHeader,
  TableSkeleton,
} from "@/components/AppShell";
import { CaseTable } from "@/components/CaseTable";
import { CasePeekDrawer } from "@/components/CasePeekDrawer";
import { CasesFacetedFilterBar, type FilterState } from "@/components/CasesFacetedFilterBar";
import { api } from "@/lib/api";

export const Route = createFileRoute("/cases/")({
  head: () => ({
    meta: [
      { title: "Cases — SentinelMail investigations" },
      {
        name: "description",
        content:
          "Search and filter business email compromise cases by risk, threat type, analyst decision and vendor.",
      },
      { property: "og:title", content: "Cases — SentinelMail investigations" },
      { property: "og:description", content: "Search and filter BEC investigation cases." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CasesPage,
});

function CasesPage() {
  const casesQuery = useQuery({ queryKey: ["cases"], queryFn: api.listCases });
  const cases = casesQuery.data?.data ?? [];

  const [filters, setFilters] = useState<FilterState>({
    q: "",
    severity: "",
    threat: "",
    decision: "",
    vendor: "",
    preset: "all",
  });
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = filters.q.trim().toLowerCase();
    return cases.filter((c) => {
      // 1. Preset filter evaluations
      if (filters.preset === "critical_high") {
        if (c.severity !== "critical" && c.severity !== "high") return false;
      } else if (filters.preset === "wire_fraud") {
        if (c.threat_class !== "invoice_fraud" && c.threat_class !== "ceo_impersonation")
          return false;
      } else if (filters.preset === "pending_action") {
        if (c.decision !== "pending" && c.decision !== "payment_held") return false;
      } else if (filters.preset === "high_exposure") {
        if ((c.amount_at_risk ?? 0) < 50000) return false;
      }

      // 2. Facet filters
      if (filters.severity && c.severity !== filters.severity) return false;
      if (filters.threat && c.threat_class !== filters.threat) return false;
      if (filters.decision && c.decision !== filters.decision) return false;
      if (filters.vendor && c.vendor !== filters.vendor) return false;

      // 3. Search query
      if (!term) return true;
      return [c.case_number, c.sender, c.subject, c.vendor ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [cases, filters]);

  return (
    <AppShell breadcrumb={["Cases"]}>
      <PageHeader
        title="Investigations Queue"
        description="Autonomous BEC detection & wire fraud incident response"
      />

      {casesQuery.isError && (
        <ConnectionNotice error={casesQuery.error} onRetry={() => casesQuery.refetch()} />
      )}

      {/* MODERN FINTECH FACETED FILTER BAR (Betterment #4) */}
      <CasesFacetedFilterBar
        cases={cases}
        filters={filters}
        onFilterChange={setFilters}
        filteredCount={filtered.length}
        totalCount={cases.length}
      />

      <div className="w-full">
        <section className="panel overflow-hidden">
          {casesQuery.isLoading ? (
            <TableSkeleton rows={8} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              message={
                cases.length === 0
                  ? "No cases yet — analyze an email to open the first investigation."
                  : "No cases match the current filters."
              }
              action={
                cases.length === 0 ? (
                  <Link
                    to="/analyze"
                    className="inline-flex items-center rounded-xl bg-primary hover:bg-primary/90 px-3.5 py-2 text-[12px] font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5"
                  >
                    Analyze email
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <CaseTable
              cases={filtered}
              selectedId={selectedCaseId}
              onSelect={(c) => {
                setSelectedCaseId(c.id);
                setIsDrawerOpen(true);
              }}
              columns={["risk", "case", "subject", "threat", "amount", "status", "time"]}
            />
          )}
        </section>
      </div>

      {/* FINTECH SLIDING FORENSIC QUICK-PEEK DRAWER */}
      <CasePeekDrawer
        caseId={selectedCaseId}
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        casesList={filtered}
        onSelectCase={(id) => setSelectedCaseId(id)}
      />
    </AppShell>
  );
}
