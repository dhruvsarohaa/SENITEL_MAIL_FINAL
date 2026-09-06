import { useMemo } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  DollarSign,
  Filter,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { threatLabels } from "@/lib/format";
import type { CaseSummary, Severity, ThreatClass } from "@/types/sentinel";

export type PresetKey = "all" | "critical_high" | "wire_fraud" | "pending_action" | "high_exposure";

export interface FilterState {
  q: string;
  severity: string;
  threat: string;
  decision: string;
  vendor: string;
  preset: PresetKey;
}

interface CasesFacetedFilterBarProps {
  cases: CaseSummary[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  filteredCount: number;
  totalCount: number;
}

const SEVERITY_CONFIG: Record<Severity, { label: string; dot: string; text: string; bg: string }> =
  {
    critical: {
      label: "Critical",
      dot: "bg-critical",
      text: "text-critical",
      bg: "bg-destructive/10 border-destructive/25",
    },
    high: {
      label: "High",
      dot: "bg-warning",
      text: "text-warning",
      bg: "bg-warning/10 border-warning/25",
    },
    medium: {
      label: "Medium",
      dot: "bg-warning/80",
      text: "text-warning",
      bg: "bg-warning/10 border-warning/25",
    },
    low: {
      label: "Low",
      dot: "bg-primary",
      text: "text-primary",
      bg: "bg-primary/10 border-primary/25",
    },
    safe: {
      label: "Safe",
      dot: "bg-safe",
      text: "text-safe",
      bg: "bg-safe/10 border-safe/25",
    },
  };

const DECISION_LABELS: Record<string, string> = {
  pending: "Pending Review",
  safe: "Marked Safe",
  payment_held: "Payment Held",
  escalated: "Escalated to IR",
  confirmed_threat: "Confirmed Threat",
};

export function CasesFacetedFilterBar({
  cases,
  filters,
  onFilterChange,
  filteredCount,
  totalCount,
}: CasesFacetedFilterBarProps) {
  // Compute dynamic facet counts
  const facetCounts = useMemo(() => {
    const severities: Record<string, number> = {};
    const threats: Record<string, number> = {};
    const decisions: Record<string, number> = {};
    const vendors: Record<string, number> = {};

    let criticalHighCount = 0;
    let wireFraudCount = 0;
    let pendingActionCount = 0;
    let highExposureCount = 0;

    for (const c of cases) {
      // Severities
      severities[c.severity] = (severities[c.severity] ?? 0) + 1;
      if (c.severity === "critical" || c.severity === "high") {
        criticalHighCount++;
      }

      // Threats
      threats[c.threat_class] = (threats[c.threat_class] ?? 0) + 1;
      if (c.threat_class === "invoice_fraud" || c.threat_class === "ceo_impersonation") {
        wireFraudCount++;
      }

      // Decisions
      decisions[c.decision] = (decisions[c.decision] ?? 0) + 1;
      if (c.decision === "pending" || c.decision === "payment_held") {
        pendingActionCount++;
      }

      // Exposure
      if ((c.amount_at_risk ?? 0) >= 50000) {
        highExposureCount++;
      }

      // Vendors
      if (c.vendor) {
        vendors[c.vendor] = (vendors[c.vendor] ?? 0) + 1;
      }
    }

    return {
      severities,
      threats,
      decisions,
      vendors,
      criticalHighCount,
      wireFraudCount,
      pendingActionCount,
      highExposureCount,
    };
  }, [cases]);

  // Handle Preset selection
  const handlePresetSelect = (preset: PresetKey) => {
    if (filters.preset === preset && preset !== "all") {
      // Toggle off back to all
      onFilterChange({
        ...filters,
        preset: "all",
        severity: "",
        threat: "",
        decision: "",
      });
      return;
    }

    switch (preset) {
      case "all":
        onFilterChange({
          q: "",
          severity: "",
          threat: "",
          decision: "",
          vendor: "",
          preset: "all",
        });
        break;
      case "critical_high":
        onFilterChange({
          ...filters,
          preset: "critical_high",
          severity: "", // custom logic handled in filter evaluator
          threat: "",
          decision: "",
        });
        break;
      case "wire_fraud":
        onFilterChange({
          ...filters,
          preset: "wire_fraud",
          severity: "",
          threat: "",
          decision: "",
        });
        break;
      case "pending_action":
        onFilterChange({
          ...filters,
          preset: "pending_action",
          severity: "",
          threat: "",
          decision: "",
        });
        break;
      case "high_exposure":
        onFilterChange({
          ...filters,
          preset: "high_exposure",
          severity: "",
          threat: "",
          decision: "",
        });
        break;
    }
  };

  const hasCustomActive =
    filters.q ||
    filters.severity ||
    filters.threat ||
    filters.decision ||
    filters.vendor ||
    filters.preset !== "all";

  const clearAllFilters = () => {
    onFilterChange({
      q: "",
      severity: "",
      threat: "",
      decision: "",
      vendor: "",
      preset: "all",
    });
  };

  const vendorList = Object.keys(facetCounts.vendors).sort();

  return (
    <div className="mb-4 space-y-3">
      {/* 1. QUICK PRESET FACET PILLS */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
        <span className="hidden sm:flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
          <SlidersHorizontal className="size-3" />
          Views:
        </span>

        {/* All Investigations */}
        <button
          type="button"
          onClick={() => handlePresetSelect("all")}
          className={`group flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap ${
            filters.preset === "all" &&
            !filters.severity &&
            !filters.threat &&
            !filters.decision &&
            !filters.q &&
            !filters.vendor
              ? "bg-primary text-primary-foreground shadow-sm font-semibold"
              : "bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <span>All Incidents</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
              filters.preset === "all" &&
              !filters.severity &&
              !filters.threat &&
              !filters.decision &&
              !filters.q &&
              !filters.vendor
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground group-hover:bg-accent"
            }`}
          >
            {totalCount}
          </span>
        </button>

        {/* Critical & High */}
        <button
          type="button"
          onClick={() => handlePresetSelect("critical_high")}
          className={`group flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap ${
            filters.preset === "critical_high"
              ? "bg-critical text-primary-foreground shadow-sm font-semibold"
              : "bg-secondary text-muted-foreground hover:bg-critical/10 hover:text-critical"
          }`}
        >
          <span className="size-1.5 rounded-full bg-critical animate-pulse" />
          <span>Critical & High</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
              filters.preset === "critical_high"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-critical/10 text-critical"
            }`}
          >
            {facetCounts.criticalHighCount}
          </span>
        </button>

        {/* Wire & Payment Diversion */}
        <button
          type="button"
          onClick={() => handlePresetSelect("wire_fraud")}
          className={`group flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap ${
            filters.preset === "wire_fraud"
              ? "bg-warning text-primary-foreground shadow-sm font-semibold"
              : "bg-secondary text-muted-foreground hover:bg-warning/10 hover:text-warning"
          }`}
        >
          <CreditCard className="size-3 text-warning group-hover:text-warning" />
          <span>Payment Diversion</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
              filters.preset === "wire_fraud"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-warning/10 text-warning"
            }`}
          >
            {facetCounts.wireFraudCount}
          </span>
        </button>

        {/* Pending AP Action */}
        <button
          type="button"
          onClick={() => handlePresetSelect("pending_action")}
          className={`group flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap ${
            filters.preset === "pending_action"
              ? "bg-primary text-primary-foreground shadow-sm font-semibold"
              : "bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary"
          }`}
        >
          <Clock className="size-3 text-primary group-hover:text-primary" />
          <span>Pending AP Hold</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
              filters.preset === "pending_action"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/10 text-primary"
            }`}
          >
            {facetCounts.pendingActionCount}
          </span>
        </button>

        {/* High Capital at Risk */}
        <button
          type="button"
          onClick={() => handlePresetSelect("high_exposure")}
          className={`group flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap ${
            filters.preset === "high_exposure"
              ? "bg-safe text-primary-foreground shadow-sm font-semibold"
              : "bg-secondary text-muted-foreground hover:bg-safe/10 hover:text-safe"
          }`}
        >
          <DollarSign className="size-3 text-safe" />
          <span>Exposure &gt;$50k</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
              filters.preset === "high_exposure"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-safe/10 text-safe"
            }`}
          >
            {facetCounts.highExposureCount}
          </span>
        </button>
      </div>

      {/* 2. SEARCH & FACET DROPDOWN BAR */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search Input */}
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={filters.q}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                q: e.target.value,
                preset: "all",
              })
            }
            placeholder="Search by case ID, sender, subject, supplier or indicator..."
            aria-label="Search cases"
            className="w-full rounded-xl border border-border bg-background pl-9 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground shadow-sm transition-all focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, q: "" })}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 p-0.5 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Facet: Severity */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer shadow-sm ${
                filters.severity
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary hover:border-border"
              }`}
            >
              <ShieldAlert className="size-3.5 text-muted-foreground" />
              <span>
                {filters.severity
                  ? (SEVERITY_CONFIG[filters.severity as Severity]?.label ?? filters.severity)
                  : "Severity"}
              </span>
              <ChevronDown className="size-3 opacity-60 ml-0.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 p-1 rounded-xl">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground font-semibold px-2 py-1">
              Filter by Risk Severity
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onFilterChange({ ...filters, severity: "", preset: "all" })}
              className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              <span>All Severities</span>
              {!filters.severity && <Check className="size-3.5 text-foreground" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1" />
            {(Object.keys(SEVERITY_CONFIG) as Severity[]).map((s) => {
              const count = facetCounts.severities[s] ?? 0;
              const config = SEVERITY_CONFIG[s];
              return (
                <DropdownMenuItem
                  key={s}
                  onClick={() => onFilterChange({ ...filters, severity: s, preset: "all" })}
                  className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-secondary"
                >
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${config.dot}`} />
                    <span className="font-medium text-foreground">{config.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-muted-foreground">{count}</span>
                    {filters.severity === s && <Check className="size-3.5 text-foreground" />}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Facet: Threat Class */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer shadow-sm ${
                filters.threat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary hover:border-border"
              }`}
            >
              <Filter className="size-3.5 text-muted-foreground" />
              <span>
                {filters.threat
                  ? (threatLabels[filters.threat as ThreatClass] ?? filters.threat)
                  : "Threat Vector"}
              </span>
              <ChevronDown className="size-3 opacity-60 ml-0.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 p-1 rounded-xl">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground font-semibold px-2 py-1">
              Filter by Threat Class
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onFilterChange({ ...filters, threat: "", preset: "all" })}
              className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              <span>All Threat Vectors</span>
              {!filters.threat && <Check className="size-3.5 text-foreground" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1" />
            {(Object.keys(threatLabels) as ThreatClass[]).map((t) => {
              const count = facetCounts.threats[t] ?? 0;
              return (
                <DropdownMenuItem
                  key={t}
                  onClick={() => onFilterChange({ ...filters, threat: t, preset: "all" })}
                  className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-secondary"
                >
                  <span className="font-medium text-foreground truncate mr-2">
                    {threatLabels[t]}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-mono text-muted-foreground">{count}</span>
                    {filters.threat === t && <Check className="size-3.5 text-foreground" />}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Facet: Status / Analyst Decision */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer shadow-sm ${
                filters.decision
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary hover:border-border"
              }`}
            >
              <Clock className="size-3.5 text-muted-foreground" />
              <span>
                {filters.decision
                  ? (DECISION_LABELS[filters.decision] ?? filters.decision)
                  : "Verdict / Status"}
              </span>
              <ChevronDown className="size-3 opacity-60 ml-0.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 p-1 rounded-xl">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground font-semibold px-2 py-1">
              Filter by Triage Status
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onFilterChange({ ...filters, decision: "", preset: "all" })}
              className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              <span>All Statuses</span>
              {!filters.decision && <Check className="size-3.5 text-foreground" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1" />
            {Object.entries(DECISION_LABELS).map(([dec, label]) => {
              const count = facetCounts.decisions[dec] ?? 0;
              return (
                <DropdownMenuItem
                  key={dec}
                  onClick={() => onFilterChange({ ...filters, decision: dec, preset: "all" })}
                  className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-secondary"
                >
                  <span className="font-medium text-foreground">{label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-muted-foreground">{count}</span>
                    {filters.decision === dec && <Check className="size-3.5 text-foreground" />}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Facet: Vendor */}
        {vendorList.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer shadow-sm ${
                  filters.vendor
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary hover:border-border"
                }`}
              >
                <Building2 className="size-3.5 text-muted-foreground" />
                <span className="truncate max-w-[130px]">
                  {filters.vendor ? filters.vendor : "Supplier"}
                </span>
                <ChevronDown className="size-3 opacity-60 ml-0.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 p-1 rounded-xl">
              <DropdownMenuLabel className="text-[11px] text-muted-foreground font-semibold px-2 py-1">
                Filter by Matched Supplier
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => onFilterChange({ ...filters, vendor: "", preset: "all" })}
                className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer"
              >
                <span>All Suppliers</span>
                {!filters.vendor && <Check className="size-3.5 text-foreground" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
              {vendorList.map((v) => {
                const count = facetCounts.vendors[v] ?? 0;
                return (
                  <DropdownMenuItem
                    key={v}
                    onClick={() => onFilterChange({ ...filters, vendor: v, preset: "all" })}
                    className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-secondary"
                  >
                    <span className="font-medium text-foreground truncate mr-2">{v}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-mono text-muted-foreground">{count}</span>
                      {filters.vendor === v && <Check className="size-3.5 text-foreground" />}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Clear / Reset Button */}
        {hasCustomActive && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 px-2.5 py-2 text-xs font-medium text-foreground transition-colors cursor-pointer"
            title="Clear all active filters"
          >
            <RotateCcw className="size-3 text-muted-foreground" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* 3. ACTIVE FILTERS PILL SUMMARY STRIP */}
      {hasCustomActive && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <span className="text-[11px] font-medium text-muted-foreground">
            Showing <strong className="text-foreground font-semibold">{filteredCount}</strong> of{" "}
            <strong className="text-foreground font-semibold">{totalCount}</strong> incidents:
          </span>

          {/* Preset Active Tag */}
          {filters.preset !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground border border-border">
              Preset:{" "}
              {filters.preset === "critical_high"
                ? "Critical & High"
                : filters.preset === "wire_fraud"
                  ? "Payment Diversion"
                  : filters.preset === "pending_action"
                    ? "Pending AP Hold"
                    : "High Exposure"}
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, preset: "all" })}
                className="hover:text-destructive cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* Severity Tag */}
          {filters.severity && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive border border-destructive/25">
              Severity: {SEVERITY_CONFIG[filters.severity as Severity]?.label ?? filters.severity}
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, severity: "" })}
                className="hover:text-destructive/80 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* Threat Tag */}
          {filters.threat && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning border border-warning/25">
              Threat: {threatLabels[filters.threat as ThreatClass] ?? filters.threat}
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, threat: "" })}
                className="hover:text-warning/80 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* Decision Tag */}
          {filters.decision && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary border border-primary/25">
              Status: {DECISION_LABELS[filters.decision] ?? filters.decision}
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, decision: "" })}
                className="hover:text-primary/80 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* Vendor Tag */}
          {filters.vendor && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-safe/10 px-2 py-0.5 text-[11px] font-medium text-safe border border-safe/25">
              Supplier: {filters.vendor}
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, vendor: "" })}
                className="hover:text-safe/80 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* Query Tag */}
          {filters.q && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground border border-border">
              Keyword: &quot;{filters.q}&quot;
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, q: "" })}
                className="hover:text-destructive cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* Clear All Shortcut */}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
