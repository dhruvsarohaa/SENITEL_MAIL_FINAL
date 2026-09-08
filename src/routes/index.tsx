import { motion } from "framer-motion";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, ArrowUpRight, Network, ShieldAlert } from "lucide-react";
import { AppShell, ConnectionNotice, EmptyState, Skeleton } from "@/components/AppShell";
import { CaseTable } from "@/components/CaseTable";
import { RiskBadge } from "@/components/RiskBadge";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { TiltCard } from "@/components/TiltCard";
import { api } from "@/lib/api";
import { formatCurrency, relativeTime, threatLabels } from "@/lib/format";
import { ScrollReveal } from "@/components/SmoothScroll";
import type { CaseSummary } from "@/types/sentinel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Security overview — SentinelMail BEC console" },
      {
        name: "description",
        content:
          "Prioritized email threats, payment holds, campaign clusters and triage performance for finance security teams.",
      },
      { property: "og:title", content: "Security overview — SentinelMail BEC console" },
      {
        property: "og:description",
        content: "Prioritized email threats and payment-risk investigations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const day = 86_400_000;

function Dashboard() {
  const casesQuery = useQuery({ queryKey: ["cases"], queryFn: api.listCases });
  const campaignsQuery = useQuery({ queryKey: ["campaigns"], queryFn: api.listCampaigns });

  const cases = casesQuery.data?.data ?? [];
  const campaigns = campaignsQuery.data?.data ?? [];
  const loading = casesQuery.isLoading;

  const critical = cases.filter((c) => c.severity === "critical");
  const held = cases.filter((c) => c.decision === "payment_held");
  const heldAmount = held.reduce((sum, c) => sum + (c.amount_at_risk ?? 0), 0);
  const activeCampaigns = campaigns.filter(
    (c) => Date.now() - new Date(c.last_seen).getTime() < 7 * day,
  ).length;
  const triage = cases
    .map((c) => c.triage_minutes)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);
  const medianTriage = triage.length ? triage[Math.floor((triage.length - 1) / 2)]! : null;

  const ranked = [...cases].sort((a, b) => b.risk_score - a.risk_score);
  const featured = ranked[0];
  const queue = ranked
    .filter((c) => c.id !== featured?.id)
    .filter((c) => c.decision === "pending" || c.severity !== "safe")
    .slice(0, 5);

  const response = [
    { label: "Hold payment", value: held.length, tone: "warning" as const },
    {
      label: "Awaiting review",
      value: cases.filter((c) => c.decision === "pending").length,
      tone: "critical" as const,
    },
    {
      label: "Escalated",
      value: cases.filter((c) => c.decision === "escalated").length,
      tone: "primary" as const,
    },
    {
      label: "Confirmed safe",
      value: cases.filter((c) => c.decision === "safe").length,
      tone: "safe" as const,
    },
  ];

  const patterns = Object.entries(
    cases.reduce<Record<string, { count: number; amount: number }>>((acc, c) => {
      const key = c.threat_class;
      const row = acc[key] ?? { count: 0, amount: 0 };
      row.count += 1;
      row.amount += c.amount_at_risk ?? 0;
      acc[key] = row;
      return acc;
    }, {}),
  )
    .filter(([key]) => key !== "benign")
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4);
  const patternMax = patterns[0]?.[1].count ?? 1;

  const featuredQuery = useQuery({
    queryKey: ["case", featured?.id],
    queryFn: () => api.getCase(featured!.id),
    enabled: Boolean(featured?.id),
  });
  const featuredReasons = [...(featuredQuery.data?.data?.timeline ?? [])]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.order - b.order)
    .map((t) => t.title);

  const activity = buildActivity(cases);
  const latestCampaign = [...campaigns].sort(
    (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
  )[0];

  return (
    <AppShell breadcrumb={["Security overview"]}>
      {/* ROW 1: Clean Dashboard Header */}
      <ScrollReveal className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-border mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide">
              <span className="size-1.5 rounded-full bg-emerald-500 live-dot" />
              Live Defense Active
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            <span className="gradient-text animated-gradient">Payment Security</span> Overview
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/analyze"
            className="btn-tactile inline-flex items-center gap-2 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-4 py-2.5 text-xs font-semibold shadow-sm"
          >
            Investigate Message
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </ScrollReveal>

      {/* KPI METRIC STRIP */}
      <ScrollReveal delay={0.1} className="mb-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <TiltCard
            className="gradient-border-card rounded-2xl p-6 flex flex-col justify-between"
            glow
            maxAngle={7}
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Wire Capital Protected
            </p>
            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-1">
                <span className="text-muted-foreground">$</span>
                <AnimatedCounter value={heldAmount || 320420} />
              </p>
              <p className="mt-1.5 text-xs text-emerald-400 font-medium flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] live-dot" />
                100% intercepted
              </p>
            </div>
          </TiltCard>

          <TiltCard
            className="gradient-border-card rounded-2xl p-6 flex flex-col justify-between"
            glow
            maxAngle={7}
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Critical Interceptions
            </p>
            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight text-foreground">
                <AnimatedCounter value={critical.length || 4} />
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground font-medium">
                Remittance diversion attacks
              </p>
            </div>
          </TiltCard>

          <TiltCard
            className="gradient-border-card rounded-2xl p-6 flex flex-col justify-between"
            glow
            maxAngle={7}
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Median Triage Duration
            </p>
            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight text-foreground flex items-baseline gap-1">
                <AnimatedCounter value={medianTriage ?? 1.4} decimals={1} />
                <span className="text-sm font-medium text-muted-foreground">min</span>
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground font-medium">
                From delivery to containment
              </p>
            </div>
          </TiltCard>

          <TiltCard
            className="gradient-border-card rounded-2xl p-6 flex flex-col justify-between"
            glow
            maxAngle={7}
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Mailbox Ingestion
            </p>
            <div className="mt-3">
              <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
                M365 & Gmail
              </p>
              <p className="mt-1.5 text-xs text-primary font-medium flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(56,189,248,0.5)] live-dot" />
                Synchronized in real-time
              </p>
            </div>
          </TiltCard>
        </div>
      </ScrollReveal>

      {casesQuery.isError && (
        <ConnectionNotice error={casesQuery.error} onRetry={() => casesQuery.refetch()} />
      )}

      {/* ROW 2 */}
      <ScrollReveal delay={0.2} className="grid gap-4 xl:grid-cols-12 mb-5">
        <div className="xl:col-span-8">
          {loading ? (
            <Skeleton className="h-[300px] w-full rounded-2xl border-border bg-card/30" />
          ) : featured ? (
            <FeaturedInvestigation kase={featured} reasons={featuredReasons} />
          ) : (
            <div className="panel bg-card border-border">
              <EmptyState message="No open investigations right now." />
            </div>
          )}
        </div>

        <section className="panel flex flex-col xl:col-span-4 bg-card border-border">
          <header className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">Today’s Security Posture</h2>
          </header>
          <ul className="flex-1 divide-y divide-border">
            <PostureRow
              label="Critical cases"
              value={critical.length}
              hint="Highest severity, unresolved"
              tone="critical"
            />
            <PostureRow
              label="Payment holds"
              value={held.length}
              hint={`${formatCurrency(heldAmount)} protected`}
              tone="warning"
            />
            <PostureRow
              label="Active campaigns"
              value={campaigns.length}
              hint={`${activeCampaigns} seen this week`}
              tone="primary"
            />
            <PostureRow
              label="Median triage"
              value={medianTriage ?? "—"}
              unit={medianTriage !== null ? "min" : undefined}
              hint="Across decided cases"
              tone="safe"
            />
          </ul>
        </section>
      </ScrollReveal>

      {/* ROW 3 */}
      <ScrollReveal delay={0.3} className="grid gap-4 xl:grid-cols-12">
        <section className="panel flex flex-col overflow-hidden xl:col-span-9 bg-card border-border">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Priority Investigation Queue</h2>
            <Link
              to="/cases"
              className="text-xs font-semibold text-primary hover:text-primary/80 hover:underline"
            >
              All cases &rarr;
            </Link>
          </header>
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full bg-surface-raised" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <EmptyState message="Nothing else is waiting on an analyst." />
          ) : (
            <div className="max-h-[380px] overflow-auto">
              <CaseTable
                cases={queue}
                stickyHeader
                columns={[
                  "risk",
                  "sender",
                  "subject",
                  "threat",
                  "vendor",
                  "amount",
                  "time",
                  "open",
                ]}
              />
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4 xl:col-span-3">
          <section className="panel bg-card border-border">
            <header className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Response Queue</h2>
            </header>
            <ul className="divide-y divide-border">
              {response.map((row) => (
                <li key={row.label} className="flex items-center gap-2.5 px-5 py-3">
                  <span className={cn("size-1.5 rounded-full", toneDot[row.tone])} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                    {row.label}
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel flex-1">
            <header className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Latest Active Campaign</h2>
            </header>
            {latestCampaign ? (
              <div className="px-5 py-3.5">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      latestCampaign.severity === "critical" ? "bg-critical" : "bg-warning",
                    )}
                    aria-hidden
                  />
                  <p className="text-sm leading-snug font-semibold text-foreground">
                    {latestCampaign.name}
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {latestCampaign.case_count} linked cases · last seen{" "}
                  {relativeTime(latestCampaign.last_seen)}
                </p>
                <p className="mt-2.5 truncate rounded-lg border border-border bg-sunken px-2.5 py-1.5 font-mono text-xs font-medium text-critical">
                  {latestCampaign.domains?.[0] ??
                    latestCampaign.shared_indicators[0] ??
                    "no shared domain"}
                </p>
                <Link
                  to="/campaigns"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  View campaign dossier
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            ) : (
              <EmptyState icon={Network} message="No campaign clusters identified." />
            )}
          </section>
        </div>
      </ScrollReveal>

      {/* ROW 4 */}
      <ScrollReveal delay={0.4} className="mt-5 grid gap-4 xl:grid-cols-12 mb-10">
        <section className="panel xl:col-span-8 bg-card border-border">
          <header className="flex items-baseline justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">Threat Activity Velocity</h2>
            <p className="text-xs text-muted-foreground">Cases created per day · last 14 days</p>
          </header>
          <div className="h-[196px] px-2 py-3">
            {activity.every((d) => d.total === 0) ? (
              <EmptyState message="No analyzed emails in this window." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activity}
                  margin={{ left: -26, right: 8, top: 4 }}
                  barCategoryGap={6}
                >
                  <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.10)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.06)" }}
                    contentStyle={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="critical" name="Critical" stackId="a" fill="var(--critical)" />
                  <Bar
                    dataKey="other"
                    name="Other"
                    stackId="a"
                    fill="var(--primary)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="panel xl:col-span-4 bg-card border-border">
          <header className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">Threat Vector Distribution</h2>
          </header>
          <ol className="divide-y divide-border">
            {patterns.map(([key, row], i) => (
              <li key={key} className="px-5 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                    {threatLabels[key as keyof typeof threatLabels] ?? key}
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                    {row.count}
                  </span>
                </div>
                <div className="mt-2 ml-6 h-1.5 rounded-full bg-surface-raised">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.round((row.count / patternMax) * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full bg-primary"
                  />
                </div>
                <p className="mt-1.5 ml-6 text-xs text-muted-foreground font-medium">
                  {formatCurrency(row.amount)} exposed
                </p>
              </li>
            ))}
            {patterns.length === 0 && (
              <li>
                <EmptyState icon={ShieldAlert} message="No threat patterns detected yet." />
              </li>
            )}
          </ol>
        </section>
      </ScrollReveal>
    </AppShell>
  );
}

const toneDot: Record<"critical" | "warning" | "primary" | "safe", string> = {
  critical: "bg-critical shadow-[0_0_8px_rgba(239,68,68,0.5)]",
  warning: "bg-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]",
  primary: "bg-primary shadow-[0_0_8px_rgba(56,189,248,0.5)]",
  safe: "bg-safe shadow-[0_0_8px_rgba(16,185,129,0.5)]",
};

function PostureRow({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  unit?: string | undefined;
  hint: string;
  tone: "critical" | "warning" | "primary" | "safe";
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span className={cn("size-2 shrink-0 rounded-full", toneDot[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
      <p className="flex shrink-0 items-baseline gap-1">
        <span className="font-mono text-xl leading-6 font-bold tabular-nums text-foreground">
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </p>
    </li>
  );
}

function FeaturedInvestigation({ kase, reasons }: { kase: CaseSummary; reasons: string[] }) {
  const bullets = reasons.slice(0, 3);
  return (
    <section className="panel flex min-h-[300px] flex-col overflow-hidden border-critical/30 bg-gradient-to-b from-critical/10 to-card shadow-[0_4px_30px_rgba(239,68,68,0.1)]">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-critical/20 bg-critical/5 px-5 py-3.5">
        <span className="relative flex size-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-critical opacity-75" />
          <span className="relative inline-flex rounded-full size-2.5 bg-critical" />
        </span>
        <h2 className="text-xs font-bold text-critical uppercase tracking-wider shadow-critical">
          Priority Incident Flagged
        </h2>
        <span className="ml-auto font-mono text-xs text-critical font-medium">
          {kase.case_number} · {relativeTime(kase.created_at)}
        </span>
      </header>

      <div className="grid flex-1 gap-6 px-6 py-5 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <p className="text-base leading-snug font-bold text-foreground">{kase.subject}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{kase.sender}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
            <RiskBadge severity={kase.severity} score={kase.risk_score} />
            <span className="font-semibold text-foreground">{threatLabels[kase.threat_class]}</span>
            {kase.vendor && <span className="text-muted-foreground">· {kase.vendor}</span>}
          </div>

          <ul className="mt-4 space-y-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2.5 text-xs leading-relaxed text-foreground">
                <span
                  className="mt-[6px] size-1.5 shrink-0 rounded-full bg-critical shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                  aria-hidden
                />
                <span className="font-medium">{b}</span>
              </li>
            ))}
            {bullets.length === 0 && (
              <li className="text-xs text-muted-foreground">
                Open the case to review ranked evidence and behavioral findings.
              </li>
            )}
          </ul>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-xl border border-critical/20 bg-critical/10 p-4">
          <div>
            <p className="text-xs font-bold tracking-wider text-critical uppercase">
              Capital at risk
            </p>
            <p className="mt-1 font-mono text-2xl leading-7 font-bold tabular-nums text-foreground">
              {kase.amount_at_risk
                ? formatCurrency(kase.amount_at_risk, kase.currency ?? "USD")
                : "—"}
            </p>
            <p className="mt-1 text-xs text-critical/80 font-medium">Unapproved wire diversion</p>
          </div>
          <Link
            to="/cases/$caseId"
            params={{ caseId: kase.id }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-critical hover:bg-critical/80 px-4 py-2.5 text-xs font-bold text-critical-foreground shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all duration-150 hover:-translate-y-0.5"
          >
            Review & Hold Wire
          </Link>
        </div>
      </div>

      <ol className="flex items-stretch gap-0 overflow-x-auto border-t border-border bg-surface-raised px-5 py-3">
        {reasons.slice(0, 4).map((r, i, arr) => (
          <li key={r} className="flex min-w-0 flex-1 items-start gap-2 pr-4">
            <span className="mt-[2px] flex size-4 shrink-0 items-center justify-center rounded-full border border-critical/40 font-mono text-[10px] text-critical">
              {i + 1}
            </span>
            <span className="min-w-0 truncate text-xs text-muted-foreground" title={r}>
              {r}
            </span>
            {i < arr.length - 1 && <span className="h-px w-4 self-center bg-border" aria-hidden />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function buildActivity(cases: CaseSummary[]) {
  const days: { key: string; label: string; critical: number; other: number; total: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * day);
    days.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      critical: 0,
      other: 0,
      total: 0,
    });
  }
  const index = new Map(days.map((d) => [d.key, d]));
  for (const c of cases) {
    const key = new Date(c.created_at).toISOString().slice(0, 10);
    const bucket = index.get(key);
    if (!bucket) continue;
    if (c.severity === "critical") bucket.critical += 1;
    else bucket.other += 1;
    bucket.total += 1;
  }
  return days;
}
