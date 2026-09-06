import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ExternalLink,
  Layers,
  Network,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import {
  AppShell,
  ConnectionNotice,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/AppShell";
import { RiskBadge } from "@/components/RiskBadge";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Campaign, Severity } from "@/types/sentinel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaign clusters — SentinelMail" },
      {
        name: "description",
        content:
          "Correlated fraud campaigns grouped by shared domains, Reply-To addresses, bank accounts and attachment hashes.",
      },
      { property: "og:title", content: "Campaign clusters — SentinelMail" },
      { property: "og:description", content: "Correlated business email compromise campaigns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const query = useQuery({ queryKey: ["campaigns"], queryFn: api.listCampaigns });
  const campaigns = query.data?.data ?? [];
  const [open, setOpen] = useState<Campaign | null>(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  // Computed metrics for the top KPI strip
  const totalCases = useMemo(
    () => campaigns.reduce((acc, c) => acc + (c.case_count || c.case_ids?.length || 0), 0),
    [campaigns],
  );

  const totalIndicators = useMemo(
    () => campaigns.reduce((acc, c) => acc + (c.shared_indicators?.length || 0), 0),
    [campaigns],
  );

  const criticalCount = useMemo(
    () => campaigns.filter((c) => c.severity === "critical").length,
    [campaigns],
  );

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchesSeverity = severityFilter === "all" || c.severity === severityFilter;
      const q = search.toLowerCase().trim();
      if (!q) return matchesSeverity;

      const matchesName = c.name.toLowerCase().includes(q);
      const matchesVictims = c.victim_teams?.some((v) => v.toLowerCase().includes(q));
      const matchesIndicators = c.shared_indicators?.some((i) => i.toLowerCase().includes(q));
      const matchesDomains = c.domains?.some((d) => d.toLowerCase().includes(q));
      const matchesBanks = c.bank_accounts?.some((b) => b.toLowerCase().includes(q));

      return (
        matchesSeverity &&
        (matchesName || matchesVictims || matchesIndicators || matchesDomains || matchesBanks)
      );
    });
  }, [campaigns, search, severityFilter]);

  return (
    <AppShell breadcrumb={["Campaigns"]}>
      <PageHeader
        title="Campaign Intelligence & Clusters"
        description="Autonomous graph correlation linking distributed BEC incidents by shared payment infrastructure, lookalike domains, and adversary tooling."
      />

      {/* KPI METRIC STRIP */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Active Clusters</span>
            <span className="rounded bg-critical/10 px-2 py-0.5 text-xs font-semibold text-critical">
              {criticalCount} Critical
            </span>
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {campaigns.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground font-medium">
              Correlated adversary groups
            </p>
          </div>
        </div>

        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Linked Incidents</span>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Inboxes
            </span>
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {totalCases}
            </p>
            <p className="mt-1 text-xs text-muted-foreground font-medium">
              Distributed mailbox attacks
            </p>
          </div>
        </div>

        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Correlated IOCs</span>
            <span className="rounded bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
              Shared
            </span>
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {totalIndicators}
            </p>
            <p className="mt-1 text-xs text-muted-foreground font-medium">
              Domains, banks, and attachments
            </p>
          </div>
        </div>

        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Target Pattern</span>
            <span className="rounded bg-safe/10 px-2 py-0.5 text-xs font-semibold text-safe">
              Pattern
            </span>
          </div>
          <div className="mt-3">
            <p className="text-base font-bold text-foreground truncate">Remittance Diversion</p>
            <p className="mt-1 text-xs text-safe font-medium">AP & Treasury targeted</p>
          </div>
        </div>
      </div>

      {query.isError && <ConnectionNotice error={query.error} onRetry={() => query.refetch()} />}

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[280px] max-w-md flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search campaigns, domains, bank accounts, or victim teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-background pl-10 pr-9 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {(["all", "critical", "high", "medium"] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors duration-150 cursor-pointer",
                severityFilter === sev
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {sev === "all" ? "All Severities" : sev}
            </button>
          ))}
        </div>
      </div>

      {/* CAMPAIGN CARDS GRID */}
      {query.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="panel p-10">
          <EmptyState
            icon={Network}
            message={
              search || severityFilter !== "all"
                ? "No campaign clusters match the active filters."
                : "No campaign clusters identified yet — new clusters emerge when multiple cases share fraud infrastructure."
            }
          />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredCampaigns.map((camp) => (
            <article
              key={camp.id}
              className="panel flex flex-col justify-between overflow-hidden transition-all duration-150 hover:shadow-md hover:border-border-strong cursor-pointer"
            >
              <div>
                <header className="border-b border-border bg-muted/30 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="relative flex size-2">
                          <span className="relative inline-flex rounded-full size-2 bg-critical" />
                        </span>
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          {camp.id}
                        </span>
                      </div>
                      <h2 className="mt-1 text-base font-bold text-foreground truncate">
                        {camp.name}
                      </h2>
                    </div>
                    <RiskBadge severity={camp.severity} />
                  </div>
                </header>

                <div className="p-5 space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-border bg-background p-3 shadow-inner">
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Linked Cases
                      </dt>
                      <dd className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">
                        {camp.case_count} inboxes
                      </dd>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3 shadow-inner">
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Shared IOCs
                      </dt>
                      <dd className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">
                        {camp.shared_indicators.length} artifacts
                      </dd>
                    </div>
                  </dl>

                  {camp.victim_teams && camp.victim_teams.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Targeted Teams
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {camp.victim_teams.map((vt) => (
                          <span
                            key={vt}
                            className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-foreground shadow-sm"
                          >
                            {vt}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Correlated Threat Indicators
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {camp.shared_indicators.slice(0, 4).map((ind) => (
                        <li
                          key={ind}
                          className="rounded border border-destructive/20 bg-destructive/10 px-2 py-0.5 font-mono text-xs text-destructive font-medium"
                        >
                          {ind}
                        </li>
                      ))}
                      {camp.shared_indicators.length > 4 && (
                        <li className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground font-medium">
                          +{camp.shared_indicators.length - 4} more
                        </li>
                      )}
                    </ul>
                  </div>

                  <p className="text-xs text-muted-foreground font-medium pt-1">
                    First seen {formatDateTime(camp.first_seen)} · Last active{" "}
                    {relativeTime(camp.last_seen)}
                  </p>
                </div>
              </div>

              <footer className="border-t border-border bg-card p-4">
                <button
                  type="button"
                  onClick={() => setOpen(camp)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 hover:-translate-y-0.5 cursor-pointer"
                >
                  Inspect Campaign Dossier
                  <ArrowRight className="size-3.5" />
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      {open && <CampaignDrawer campaign={open} onClose={() => setOpen(null)} />}
    </AppShell>
  );
}

function CampaignDrawer({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close dossier"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-xs transition-opacity"
      />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-background shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-6 py-4 backdrop-blur-md">
          <div>
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Forensic Campaign Dossier
            </span>
            <h2 className="mt-0.5 text-lg font-bold text-foreground">{campaign.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="space-y-6 px-6 py-6">
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
            <RiskBadge severity={campaign.severity} />
            <span className="text-xs text-muted-foreground font-medium">
              {campaign.case_count} linked incidents · first seen{" "}
              {formatDateTime(campaign.first_seen)} · last seen {formatDateTime(campaign.last_seen)}
            </span>
          </div>

          <Section title="Linked Case Incidents">
            <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {(campaign.cases ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors"
                >
                  <RiskBadge severity={c.severity} score={c.risk_score} />
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: c.id }}
                    className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground hover:text-primary"
                  >
                    {c.subject}
                  </Link>
                  <span className="font-mono text-xs font-bold text-muted-foreground">
                    {c.case_number}
                  </span>
                </li>
              ))}
              {(campaign.cases ?? []).length === 0 &&
                campaign.case_ids.map((id) => (
                  <li key={id} className="p-3 font-mono text-xs text-muted-foreground">
                    {id}
                  </li>
                ))}
            </ul>
          </Section>

          <IndicatorList title="Known Attack Domains" items={campaign.domains} />
          <IndicatorList title="Unseen Reply-To Destinations" items={campaign.reply_tos} />
          <IndicatorList title="Diverted Bank Accounts" items={campaign.bank_accounts} />
          <IndicatorList
            title="Malicious Attachment SHA-256 Hashes"
            items={campaign.attachment_hashes}
          />

          {campaign.recommended_actions && campaign.recommended_actions.length > 0 && (
            <Section title="Recommended Autonomous Containment Actions">
              <ul className="space-y-2">
                {campaign.recommended_actions.map((a) => (
                  <li
                    key={a}
                    className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-xs text-foreground"
                  >
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span className="font-medium">{a}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function IndicatorList({ title, items }: { title: string; items?: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <Section title={title}>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <li
            key={i}
            className="rounded-lg border border-border bg-[var(--sunken)] px-2.5 py-1 font-mono text-xs break-all text-foreground"
          >
            {i}
          </li>
        ))}
      </ul>
    </Section>
  );
}
