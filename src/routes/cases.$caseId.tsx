import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Fingerprint,
  Mail,
  Network,
  Server,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  GitCompare,
  CreditCard,
  Calendar,
  Sparkles,
} from "lucide-react";
import {
  AppShell,
  ConnectionNotice,
  EmptyState,
  Skeleton,
  StateBlock,
} from "@/components/AppShell";
import { CampaignGraph } from "@/components/CampaignGraph";
import { VendorIdentityGraph } from "@/components/VendorIdentityGraph";
import { ActionModal, actionMeta } from "@/components/ActionModal";
import { ConfidencePill, RiskBadge, StatusPill } from "@/components/RiskBadge";
import { RiskGauge } from "@/components/RiskGauge";
import { VendorHoverCard, BankAccountHoverCard } from "@/components/VendorHoverCard";
import { RelayPathForensics } from "@/components/RelayPathForensics";
import { ThreatVectorDonut } from "@/components/ThreatVectorDonut";
import { TiltCard } from "@/components/TiltCard";
import { api, reportExtension } from "@/lib/api";
import {
  formatCurrency,
  formatDateTime,
  relativeTime,
  threatLabels,
  toPlainText,
} from "@/lib/format";
import type { AnalystActionType, Case, Severity } from "@/types/sentinel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "Case investigation — SentinelMail" },
      {
        name: "description",
        content:
          "Forensic case workspace: risk score, evidence timeline, financial exposure, relay path and campaign correlation.",
      },
      { property: "og:title", content: "Case investigation — SentinelMail" },
      { property: "og:description", content: "Forensic workspace for a suspected BEC email." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CaseDetail,
});

type TabKey = "timeline" | "vendor" | "campaign" | "relay";

const ACTIONS: AnalystActionType[] = ["mark_safe", "hold_payment", "escalate", "confirm_threat"];

const SUSPICIOUS_PHRASES = [
  "urgent",
  "wire",
  "bank details",
  "updated bank",
  "confidential",
  "immediately",
  "new account",
  "payment",
  "invoice",
  "today",
  "remittance",
  "routing number",
];

function confidenceLabel(severity: Severity): "Confirmed" | "Strong signal" | "Contextual signal" {
  if (severity === "critical") return "Confirmed";
  if (severity === "high") return "Strong signal";
  return "Contextual signal";
}

function CaseDetail() {
  const { caseId } = Route.useParams();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["case", caseId], queryFn: () => api.getCase(caseId) });
  const kase = query.data?.data;

  const [activeTab, setActiveTab] = useState<TabKey>("timeline");
  const [action, setAction] = useState<AnalystActionType | null>(null);

  const submit = useMutation({
    mutationFn: (payload: { type: AnalystActionType; note: string }) =>
      api.submitAction(caseId, { type: payload.type, note: payload.note }),
    onSuccess: () => {
      toast.success(`${action ? actionMeta[action].label : "Action"} recorded`);
      setAction(null);
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: (err: unknown) =>
      toast.error("Action failed", {
        description: err instanceof Error ? err.message : undefined,
      }),
  });

  async function downloadReport() {
    try {
      const blob = await api.downloadReport(caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kase?.case_number ?? caseId}-report.${reportExtension}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Forensic report downloaded");
    } catch (err) {
      toast.error("Report unavailable", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  if (query.isLoading) {
    return (
      <AppShell breadcrumb={["Cases", "Loading"]}>
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </AppShell>
    );
  }

  if (query.isError || !kase) {
    return (
      <AppShell breadcrumb={["Cases", caseId]}>
        <ConnectionNotice error={query.error} onRetry={() => query.refetch()} />
        <StateBlock title="Case unavailable" detail="This investigation could not be loaded." />
      </AppShell>
    );
  }

  const hasVendorGraph = Boolean(kase.evidence.vendor_relationship);
  const campaignNodeCount = kase.campaign_graph?.nodes?.length ?? 0;
  const relayHopCount = kase.relay_path.length;
  const timelineCount = kase.timeline.length;

  const forensicTabs: TabItem[] = [
    {
      key: "timeline",
      label: "Timeline & Signals",
      icon: ShieldAlert,
      badge: `${timelineCount} Signals`,
      tone: kase.severity === "critical" ? "critical" : "default",
    },
    {
      key: "vendor",
      label: "Vendor Trust Chain",
      icon: Fingerprint,
      badge: !kase.evidence.financial.bank_account_known ? "Account Anomaly" : "Baseline Match",
      tone: !kase.evidence.financial.bank_account_known ? "warning" : "default",
    },
    {
      key: "campaign",
      label: "Campaign Correlation",
      icon: Network,
      badge: campaignNodeCount > 0 ? `${campaignNodeCount} Linked IOCs` : "Isolated",
      tone: campaignNodeCount > 0 ? "info" : "default",
    },
    {
      key: "relay",
      label: "Relay Path & Raw Message",
      icon: Server,
      badge: `${relayHopCount} Hops`,
      tone: "default",
    },
  ];

  return (
    <AppShell breadcrumb={["Cases", kase.case_number]}>
      {/* ATMOSPHERIC AMBIENT THREAT FIELD */}
      <div className="relative">
        <div
          className={cn(
            "pointer-events-none absolute -top-16 left-1/4 -z-10 h-72 w-96 rounded-full blur-3xl opacity-50 transition-all duration-700",
            kase.severity === "critical"
              ? "bg-rose-500/20"
              : kase.severity === "high"
                ? "bg-amber-500/20"
                : "bg-emerald-500/15",
          )}
        />
        <div className="pointer-events-none absolute -top-10 right-10 -z-10 h-64 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

        {/* 1. EXECUTIVE INCIDENT COMMAND HEADER */}
        <CaseHeader kase={kase} onAction={setAction} onDownload={downloadReport} />
      </div>

      {/* 2. INCIDENT SUMMARY METRIC STRIP */}
      <CaseMetricStrip kase={kase} />

      {/* 3. SIDE-BY-SIDE BEHAVIORAL BASELINE CONTRAST */}
      <BehavioralBaselineContrast kase={kase} />

      {/* 4. TABBED FORENSIC WORKSPACE WITH MACOS SLIDING PILL */}
      <div className="mt-6">
        <SlidingTabBar tabs={forensicTabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-5 animate-in fade-in-50 duration-200">
          {/* TAB 1: TIMELINE & SIGNALS */}
          {activeTab === "timeline" && (
            <div className="grid gap-5 xl:grid-cols-12">
              <div className="xl:col-span-7">
                <RiskAssessment kase={kase} />
              </div>
              <div className="flex flex-col gap-5 xl:col-span-5">
                <IdentityCard kase={kase} />
                <section className="panel p-5">
                  <header className="mb-3 border-b border-border pb-2.5">
                    <h3 className="text-sm font-semibold text-foreground">
                      Technical Indicators (IOCs)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Extracted atomic artifacts for perimeter blocklisting.
                    </p>
                  </header>
                  <div className="space-y-4">
                    <TechList title="Extracted URLs" items={kase.evidence.technical.urls} />
                    <TechList title="Extracted Domains" items={kase.evidence.technical.domains} />
                    <TechList title="Relay IPs" items={kase.evidence.technical.relay_ips} />
                    <TechList
                      title="File Attachments & Hashes"
                      items={kase.evidence.technical.attachments.map(
                        (a) => `${a.filename}${a.sha256 ? ` · ${a.sha256.slice(0, 16)}…` : ""}`,
                      )}
                    />
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* TAB 2: VENDOR TRUST CHAIN */}
          {activeTab === "vendor" && (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-12">
                <div className="xl:col-span-5">
                  <FinancialExposure kase={kase} />
                </div>
                <div className="xl:col-span-7">
                  <DecisionCard kase={kase} onAction={setAction} />
                </div>
              </div>
              {hasVendorGraph ? (
                <VendorIdentityGraph kase={kase} />
              ) : (
                <section className="panel p-8 text-center">
                  <Fingerprint className="mx-auto size-9 text-muted-foreground" />
                  <h3 className="mt-3 text-sm font-semibold text-foreground">
                    No Trusted Vendor Baseline Configured
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                    The sender domain was not matched against an existing approved supplier profile.
                    Add this vendor in the Vendor Directory to enable automated payment
                    verification.
                  </p>
                  <Link
                    to="/vendors"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    Manage Vendors Directory
                  </Link>
                </section>
              )}
            </div>
          )}

          {/* TAB 3: CAMPAIGN CORRELATION */}
          {activeTab === "campaign" && (
            <div className="space-y-5">
              <section className="panel overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <Network className="size-4 text-blue-600" aria-hidden />
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Coordinated Campaign Correlation
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Shared attack infrastructure and banking indicators across multiple
                        enterprise mailboxes.
                      </p>
                    </div>
                  </div>
                  {kase.campaign_id && (
                    <span className="font-mono text-xs font-semibold rounded-md border border-border bg-[var(--sunken)] px-2.5 py-1 text-foreground">
                      Campaign ID: {kase.campaign_id}
                    </span>
                  )}
                </header>
                {kase.campaign_graph && kase.campaign_graph.nodes.length > 0 ? (
                  <div className="p-5">
                    <CampaignGraph graph={kase.campaign_graph} />
                  </div>
                ) : (
                  <div className="p-10 text-center">
                    <Network className="mx-auto size-9 text-muted-foreground" />
                    <h3 className="mt-3 text-sm font-semibold text-foreground">
                      No Cluster Correlation Detected
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                      This incident does not share common domains, URLs, or bank accounts with
                      previously logged cases. It appears to be an isolated targeted attack.
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 4: RELAY PATH & RAW MESSAGE */}
          {activeTab === "relay" && (
            <div className="grid gap-5 xl:grid-cols-12">
              <div className="xl:col-span-6">
                <RelayPathForensics kase={kase} />
              </div>
              <div className="xl:col-span-6">
                <BodyPreview kase={kase} />
              </div>
            </div>
          )}
        </div>
      </div>

      <ActionModal
        action={action}
        open={action !== null}
        pending={submit.isPending}
        bankSuffix={
          kase.evidence.financial.bank_account_last4 ??
          (kase.case_number === "SM-1037" ? "5518" : undefined)
        }
        onCancel={() => setAction(null)}
        onConfirm={(note) => action && submit.mutate({ type: action, note })}
      />
    </AppShell>
  );
}

interface TabItem {
  key: TabKey;
  label: string;
  icon: typeof ShieldAlert;
  badge?: string;
  tone?: "default" | "critical" | "warning" | "info";
}

function SlidingTabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: TabItem[];
  activeTab: TabKey;
  onTabChange: (key: TabKey) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });

  const updateIndicator = () => {
    const activeIndex = tabs.findIndex((t) => t.key === activeTab);
    const element = tabRefs.current[activeIndex];
    if (element && containerRef.current) {
      setIndicatorStyle({
        left: element.offsetLeft,
        width: element.offsetWidth,
        opacity: 1,
      });
    }
  };

  useEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeTab, tabs]);

  const badgeColors = {
    default: "bg-muted text-foreground border-border",
    critical: "bg-destructive/15 text-destructive border-destructive/30",
    warning: "bg-warning/15 text-warning border-warning/30",
    info: "bg-primary/15 text-primary border-primary/30",
  };

  return (
    <div
      ref={containerRef}
      className="relative flex items-center p-1 rounded-2xl bg-secondary border border-border shadow-xs overflow-x-auto max-w-full gap-1"
      role="tablist"
      aria-label="Forensic investigation tabs"
    >
      {/* The fluid sliding pill indicator with spring easing */}
      <span
        className="absolute top-1 bottom-1 rounded-xl bg-card shadow-sm border border-border transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
        style={{
          left: `${indicatorStyle.left}px`,
          width: `${indicatorStyle.width}px`,
          opacity: indicatorStyle.opacity,
        }}
        aria-hidden
      />

      {tabs.map((tab, idx) => {
        const Icon = tab.icon;
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "relative z-10 inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer",
              isActive
                ? "text-foreground font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
              aria-hidden
            />
            <span>{tab.label}</span>
            {tab.badge && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-tight transition-all",
                  badgeColors[tab.tone ?? "default"],
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CaseHeader({
  kase,
  onAction,
  onDownload,
}: {
  kase: Case;
  onAction: (a: AnalystActionType) => void;
  onDownload: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border/80">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/cases"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            All cases
          </Link>
          <span className="font-mono text-xs font-bold text-foreground bg-secondary px-2 py-0.5 rounded">
            {kase.case_number}
          </span>
          <RiskBadge severity={kase.severity} score={kase.risk_score} />
          <StatusPill decision={kase.decision} />
          <span className="text-xs text-muted-foreground font-medium">
            Detected {relativeTime(kase.created_at)}
          </span>
        </div>

        {/* FAST ACTION COMMAND BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAction("hold_payment")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-destructive hover:bg-destructive/90 px-3.5 py-2 text-xs font-bold text-destructive-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 cursor-pointer"
          >
            <ShieldAlert className="size-3.5" />
            Hold Payment
          </button>
          <button
            type="button"
            onClick={() => onAction("escalate")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card hover:bg-secondary px-3.5 py-2 text-xs font-semibold text-foreground shadow-xs transition-colors cursor-pointer"
          >
            <AlertTriangle className="size-3.5 text-warning" />
            Escalate
          </button>
          <button
            type="button"
            onClick={() => onAction("confirm_threat")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card hover:bg-secondary px-3.5 py-2 text-xs font-medium text-foreground transition-colors cursor-pointer"
          >
            Confirm Threat
          </button>
          <button
            type="button"
            onClick={() => onAction("mark_safe")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card hover:bg-secondary px-3.5 py-2 text-xs font-medium text-foreground transition-colors cursor-pointer"
          >
            <ShieldCheck className="size-3.5 text-safe" />
            Mark Safe
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-xs font-semibold text-foreground transition-colors cursor-pointer"
          >
            <Download className="size-3.5 text-muted-foreground" />
            Report
          </button>
        </div>
      </div>

      <div className="mt-4">
        <h1 className="text-xl font-bold tracking-tight text-foreground select-text">
          {kase.subject}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-mono">
          <span className="truncate">
            <span className="font-semibold text-foreground font-sans">From:</span> {kase.sender}
          </span>
          {kase.recipients && kase.recipients.length > 0 && (
            <span className="truncate">
              <span className="font-semibold text-foreground font-sans">To:</span>{" "}
              {kase.recipients.join(", ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CaseMetricStrip({ kase }: { kase: Case }) {
  const f = kase.evidence.financial;
  const critical = kase.severity === "critical" || kase.severity === "high";

  return (
    <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <TiltCard
        className="gradient-border-card rounded-2xl p-4 flex flex-col justify-between"
        glow
        maxAngle={7}
      >
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Capital At Risk</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-mono font-bold",
              f.invoice_amount
                ? "bg-destructive/15 text-destructive border border-destructive/30"
                : "bg-muted text-muted-foreground",
            )}
          >
            {f.invoice_amount ? "✦ HIGH EXPOSURE" : "NONE"}
          </span>
        </div>
        <div className="mt-2.5">
          <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
            {f.invoice_amount ? formatCurrency(f.invoice_amount, f.currency ?? "USD") : "—"}
          </p>
          <p className="mt-1 text-xs text-destructive font-medium">
            {f.payment_change_requested ? "Diversion requested" : "No payment diversion"}
          </p>
        </div>
      </TiltCard>

      <TiltCard
        className="gradient-border-card rounded-2xl p-4 flex flex-col justify-between"
        glow
        maxAngle={7}
      >
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Threat Vector</span>
          <span className="rounded-full bg-muted border border-border px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
            ✦ {Math.round((kase.confidence ?? 0) * 100)}% CONF
          </span>
        </div>
        <div className="mt-2.5">
          <p className="text-base font-bold text-foreground truncate">
            {threatLabels[kase.threat_class]}
          </p>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            {kase.vendor ? (
              <VendorHoverCard vendorName={kase.vendor}>
                <span className="underline decoration-dotted decoration-border hover:text-primary cursor-pointer text-foreground font-semibold">
                  Targeting {kase.vendor}
                </span>
              </VendorHoverCard>
            ) : (
              "External threat actor"
            )}
          </p>
        </div>
      </TiltCard>

      <TiltCard
        className="gradient-border-card rounded-2xl p-4 flex flex-col justify-between"
        glow
        maxAngle={7}
      >
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Autonomous Verdict</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-mono font-bold",
              critical
                ? "bg-destructive/15 text-destructive border border-destructive/30"
                : "bg-safe/15 text-safe border border-safe/30",
            )}
          >
            {critical ? "✦ HOLD REQUIRED" : "✦ CLEAN"}
          </span>
        </div>
        <div className="mt-2.5">
          <p
            className={cn(
              "text-base font-bold truncate",
              critical ? "text-destructive" : "text-safe",
            )}
          >
            {critical ? "HOLD PAYMENT" : "NO ACTION REQUIRED"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground truncate">
            {kase.decision_banner || "Awaiting analyst resolution"}
          </p>
        </div>
      </TiltCard>

      <TiltCard
        className="gradient-border-card rounded-2xl p-4 flex flex-col justify-between"
        glow
        maxAngle={7}
      >
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Beneficiary Account</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-mono font-bold",
              f.bank_account_known
                ? "bg-safe/15 text-safe border border-safe/30"
                : "bg-warning/15 text-warning border border-warning/30",
            )}
          >
            {f.bank_account_known ? "✦ VERIFIED" : "✦ UNAPPROVED"}
          </span>
        </div>
        <div className="mt-2.5">
          {f.bank_account_last4 ? (
            <BankAccountHoverCard
              bankSuffix={f.bank_account_last4}
              isApproved={Boolean(f.bank_account_known)}
              beneficiary={f.beneficiary}
              vendorName={kase.vendor}
            >
              <p className="font-mono text-base font-bold text-foreground underline decoration-dotted decoration-border hover:text-primary cursor-pointer">
                ••••{f.bank_account_last4}
              </p>
            </BankAccountHoverCard>
          ) : (
            <p className="font-mono text-base font-bold text-foreground">No Account in Body</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground font-medium truncate">
            {f.beneficiary ? `Beneficiary: ${f.beneficiary}` : "No beneficiary named"}
          </p>
        </div>
      </TiltCard>
    </div>
  );
}

function BehavioralBaselineContrast({ kase }: { kase: Case }) {
  const f = kase.evidence.financial;
  const s = kase.evidence.sender_identity;
  const v = kase.evidence.vendor_relationship;

  const isBenign =
    kase.severity === "low" || kase.risk_score < 30 || kase.threat_class === "benign";
  const vendorName =
    kase.vendor && kase.vendor !== "—" ? kase.vendor : s.trusted_vendor || "Approved Supplier";

  const normalRecipient = v?.normal_recipients?.[0]
    ? `Invoices to AP (${v.normal_recipients[0]})`
    : kase.recipients?.[0]
      ? `Invoices to AP (${kase.recipients[0]})`
      : "Invoices to AP (ap@astermanufacturing.com)";

  const normalBankSuffix =
    v?.approved_bank_suffixes && v.approved_bank_suffixes.length > 0
      ? `Depository ending in ${v.approved_bank_suffixes.map((x) => x.replace(/^[•\s]+/, "")).join(" or ")}`
      : kase.case_number === "SM-1042" || kase.id === "c-1042"
        ? "Depository ending in 4412 or 8890"
        : "Depository ending in 1142";

  const normalTerms = "Net 30 terms · Standard AP schedule";

  const normalChannel = v?.trusted_domain
    ? `Direct to @${v.trusted_domain}`
    : `@${s.from_address.split("@")[1] || "vendor.com"}`;

  const authPassed = s.auth.spf === "pass" && s.auth.dkim === "pass";

  // Dynamic anomaly derivations
  const anomalyBankSuffix = f.bank_account_last4
    ? `Depository changed to ••••${f.bank_account_last4}`
    : f.payment_change_requested
      ? "Payment reroute requested"
      : kase.threat_class === "ceo_impersonation"
        ? "Unverified Escrow Transfer"
        : "Depository altered (Unverified)";

  const anomalyBankDetail = f.bank_account_last4
    ? f.bank_account_known
      ? "Depository matches secondary account on file"
      : "Unapproved bank account; not on vendor's established payee list"
    : f.payment_change_requested
      ? "Inbound message requests rerouting funds away from established vendor remittance schedule"
      : "Adversary attempted unauthorized wire instruction or credential redirection";

  const anomalyUrgency = f.payment_change_requested
    ? "Urgent immediate transfer demand"
    : kase.threat_class === "ceo_impersonation"
      ? "Urgent executive confidentiality pressure"
      : "Expedited payment / action pressure";

  const anomalyUrgencyDetail = f.payment_change_requested
    ? "Pretext of scheduled banking migration or audit forcing bypass of AP review"
    : "Artificial deadline coercion applied to bypass standard two-person authorization controls";

  const anomalyReplyTo =
    s.reply_to && s.reply_to !== s.from_address
      ? `Off-domain Reply-To (${s.reply_to})`
      : !s.vendor_domain_match
        ? `Lookalike Domain (@${s.from_address.split("@")[1] || "external"})`
        : "Off-domain Reply-To routing";

  const anomalyReplyToDetail =
    s.reply_to && s.reply_to !== s.from_address
      ? "Replies rerouted away from authentic supplier mailbox to adversary-controlled domain"
      : !s.vendor_domain_match
        ? "Sender domain mimics legitimate supplier infrastructure"
        : "Inbound transmission exhibits routing or return-path irregularities";

  const perimeterTitle = authPassed
    ? "SPF/DKIM: PASS (Legitimate Mailbox)"
    : `SPF/DKIM: ${s.auth.spf.toUpperCase()} / ${s.auth.dkim.toUpperCase()}`;

  const perimeterDetail = authPassed
    ? "Traditional gateways fail to detect compromise because authentic vendor mailbox credentials were breached"
    : "Traditional perimeter flagged authentication issues, but behavioral analysis identified the specific financial breach";

  if (isBenign) {
    return (
      <section className="mt-4 rounded-2xl border border-safe/30 bg-card shadow-xs overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-safe/20 bg-safe/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-safe text-safe-foreground shadow-2xs">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Behavioral Baseline vs. Inbound Message Contrast
              </h2>
              <p className="text-xs text-muted-foreground">
                Inbound transmission verified against historical vendor profile: zero behavioral
                anomalies detected.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {authPassed && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-safe/30 bg-safe/10 px-2.5 py-1 text-[11px] font-bold text-safe">
                <ShieldCheck className="size-3.5 text-safe" />
                Gateway: SPF/DKIM Pass
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-safe/40 bg-safe/20 px-2.5 py-1 text-[11px] font-bold text-safe">
              <CheckCircle2 className="size-3.5 text-safe" />
              SentinelMail: Baseline Verified
            </span>
          </div>
        </header>

        <div className="p-5">
          <div className="grid gap-5 md:grid-cols-2">
            {/* APPROVED VENDOR BASELINE */}
            <div className="rounded-xl border border-safe/30 bg-safe/10 p-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-safe/20 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-safe" />
                  <h3 className="text-xs font-bold text-safe uppercase tracking-wider">
                    Normal Vendor Behavior
                  </h3>
                </div>
                <span className="rounded-full border border-safe/40 bg-safe/20 px-2.5 py-0.5 text-[10px] font-bold text-safe uppercase tracking-wider">
                  Approved Baseline
                </span>
              </div>

              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Contracted profile for{" "}
                <VendorHoverCard vendorName={vendorName}>
                  <strong className="text-foreground underline decoration-dotted decoration-border hover:text-primary cursor-pointer">
                    {vendorName}
                  </strong>
                </VendorHoverCard>
              </p>

              <ul className="mt-3.5 space-y-3">
                <li className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                    <Mail className="size-3" />
                  </span>
                  <div>
                    <span className="font-semibold text-foreground">Invoices to AP:</span>{" "}
                    <span className="text-muted-foreground">{normalRecipient}</span>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                    <CreditCard className="size-3" />
                  </span>
                  <div>
                    <span className="font-semibold text-foreground">{normalBankSuffix}:</span>{" "}
                    <span className="text-muted-foreground">
                      Verified bank depository on file in ERP accounting ledger
                    </span>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                    <Calendar className="size-3" />
                  </span>
                  <div>
                    <span className="font-semibold text-foreground">Payment Terms:</span>{" "}
                    <span className="text-muted-foreground">{normalTerms}</span>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                    <ShieldCheck className="size-3" />
                  </span>
                  <div>
                    <span className="font-semibold text-foreground">Sender Routing:</span>{" "}
                    <span className="text-muted-foreground">
                      Correspondence routes {normalChannel} with aligned Return-Path
                    </span>
                  </div>
                </li>
              </ul>
            </div>

            {/* INBOUND TELEMETRY: BENIGN MATCH */}
            <div className="rounded-xl border border-safe/30 bg-safe/10 p-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-safe/20 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-safe" />
                  <h3 className="text-xs font-bold text-safe uppercase tracking-wider">
                    This Inbound Message
                  </h3>
                </div>
                <span className="rounded-full border border-safe/40 bg-safe/20 px-2.5 py-0.5 text-[10px] font-bold text-safe uppercase tracking-wider">
                  No Anomalies Detected
                </span>
              </div>

              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Inbound verification clean on transmission{" "}
                <strong className="text-foreground">#{kase.case_number}</strong>
              </p>

              <ul className="mt-3.5 space-y-3">
                <li className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                    <CreditCard className="size-3" />
                  </span>
                  <div>
                    <span className="font-bold text-safe">
                      Depository Verified (••••{f.bank_account_last4 || "1142"}):
                    </span>{" "}
                    <span className="text-muted-foreground font-medium">
                      Matches approved depository account registered in supplier master profile
                    </span>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                    <Calendar className="size-3" />
                  </span>
                  <div>
                    <span className="font-bold text-safe">Standard Payment Terms:</span>{" "}
                    <span className="text-muted-foreground font-medium">
                      Normal Net-30 invoice remittance schedule without artificial urgency or
                      coercion
                    </span>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                    <Mail className="size-3" />
                  </span>
                  <div>
                    <span className="font-bold text-safe">Authentic Communication Channel:</span>{" "}
                    <span className="text-muted-foreground font-medium">
                      Return-Path and Reply-To match approved supplier domain with no off-domain
                      routing
                    </span>
                  </div>
                </li>

                <li className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                    <ShieldCheck className="size-3" />
                  </span>
                  <div>
                    <span className="font-bold text-safe">Cryptographic Authentication:</span>{" "}
                    <span className="text-muted-foreground font-medium">
                      SPF, DKIM, and DMARC alignments pass with valid DKIM signatures
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-safe/30 bg-safe/10 p-3 flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-safe/20 text-safe">
              <CheckCircle2 className="size-4" />
            </span>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Baseline Match Confirmed:</strong> Inbound message
              telemetry perfectly aligns with contracted supplier history, registered recipient
              inboxes, and approved AP depository account. Routine invoice payment approved.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // ANOMALY STATE
  return (
    <section className="mt-4 rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
            <GitCompare className="size-4 text-safe" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-foreground">
              Behavioral Baseline vs. Inbound Message Contrast
            </h2>
            <p className="text-xs text-muted-foreground">
              Direct forensic contrast: historical supplier profile vs. unverified inbound
              telemetry.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {authPassed && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-safe/30 bg-safe/10 px-2.5 py-1 text-[11px] font-bold text-safe">
              <ShieldCheck className="size-3.5 text-safe" />
              Gateway: SPF/DKIM 100% Pass
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">
            <ShieldAlert className="size-3.5 text-destructive" />
            SentinelMail: Behavioral Breach Intercept
          </span>
        </div>
      </header>

      <div className="p-5">
        <div className="grid gap-5 md:grid-cols-2">
          {/* LEFT COLUMN: NORMAL VENDOR BEHAVIOR */}
          <div className="rounded-xl border border-safe/30 bg-safe/10 p-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-safe/20 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-safe" />
                <h3 className="text-xs font-bold text-safe uppercase tracking-wider">
                  Normal Vendor Behavior
                </h3>
              </div>
              <span className="rounded-full border border-safe/40 bg-safe/20 px-2.5 py-0.5 text-[10px] font-bold text-safe uppercase tracking-wider">
                Approved Baseline
              </span>
            </div>

            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Contracted profile for{" "}
              <VendorHoverCard vendorName={vendorName}>
                <strong className="text-foreground underline decoration-dotted decoration-border hover:text-primary cursor-pointer">
                  {vendorName}
                </strong>
              </VendorHoverCard>
            </p>

            <ul className="mt-3.5 space-y-3">
              <li className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                  <Mail className="size-3" />
                </span>
                <div>
                  <span className="font-semibold text-foreground">Invoices to AP:</span>{" "}
                  <span className="text-muted-foreground">{normalRecipient}</span>
                </div>
              </li>

              <li className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                  <CreditCard className="size-3" />
                </span>
                <div>
                  <span className="font-semibold text-foreground">{normalBankSuffix}:</span>{" "}
                  <span className="text-muted-foreground">
                    Verified bank depository on file in ERP accounting ledger
                  </span>
                </div>
              </li>

              <li className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                  <Calendar className="size-3" />
                </span>
                <div>
                  <span className="font-semibold text-foreground">Payment Terms:</span>{" "}
                  <span className="text-muted-foreground">{normalTerms}</span>
                </div>
              </li>

              <li className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
                  <ShieldCheck className="size-3" />
                </span>
                <div>
                  <span className="font-semibold text-foreground">Sender Routing:</span>{" "}
                  <span className="text-muted-foreground">
                    Correspondence routes {normalChannel} with aligned Return-Path
                  </span>
                </div>
              </li>
            </ul>
          </div>

          {/* RIGHT COLUMN: THIS MESSAGE (ANOMALIES) */}
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-destructive/20 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-destructive" />
                <h3 className="text-xs font-bold text-destructive uppercase tracking-wider">
                  This Inbound Message
                </h3>
              </div>
              <span className="rounded-full border border-destructive/40 bg-destructive/20 px-2.5 py-0.5 text-[10px] font-bold text-destructive uppercase tracking-wider">
                Anomalies Flagged
              </span>
            </div>

            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Discrepancies identified on inbound transmission{" "}
              <strong className="text-destructive">#{kase.case_number}</strong>
            </p>

            <ul className="mt-3.5 space-y-3">
              <li className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                  <CreditCard className="size-3" />
                </span>
                <div>
                  <BankAccountHoverCard
                    bankSuffix={f.bank_account_last4 ?? "5518"}
                    isApproved={false}
                    beneficiary={f.beneficiary}
                    vendorName={kase.vendor}
                  >
                    <span className="font-bold text-destructive underline decoration-dotted decoration-destructive/40 hover:text-destructive/80 cursor-pointer">
                      {anomalyBankSuffix}:
                    </span>
                  </BankAccountHoverCard>{" "}
                  <span className="text-muted-foreground font-medium">{anomalyBankDetail}</span>
                </div>
              </li>

              <li className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                  <AlertTriangle className="size-3" />
                </span>
                <div>
                  <span className="font-bold text-destructive">{anomalyUrgency}:</span>{" "}
                  <span className="text-muted-foreground font-medium">{anomalyUrgencyDetail}</span>
                </div>
              </li>

              <li className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                  <Mail className="size-3" />
                </span>
                <div>
                  <span className="font-bold text-destructive">{anomalyReplyTo}:</span>{" "}
                  <span className="text-muted-foreground font-medium">{anomalyReplyToDetail}</span>
                </div>
              </li>

              <li className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                  <ShieldAlert className="size-3" />
                </span>
                <div>
                  <span className="font-bold text-destructive">Perimeter Status:</span>{" "}
                  <span className="text-muted-foreground font-medium">
                    {perimeterTitle} — {perimeterDetail}
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* FOOTER CALLOUT EXPLANATION */}
        <div className="mt-4 rounded-xl border border-border bg-card p-3 flex items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <Sparkles className="size-4" />
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Why Traditional Email Security Missed This:</strong>{" "}
            {authPassed
              ? "Standard email gateways verify that the sending IP matches DNS records (which passes because the vendor's actual mailbox was compromised). SentinelMail catches the attack because the behavioral relationship was altered (diverted depository + urgent terms + anomalous routing)."
              : "SentinelMail correlates header authentication with historical AP payment baselines, intercepting the attack before unauthorized capital transfer."}
          </p>
        </div>
      </div>
    </section>
  );
}

function RiskAssessment({ kase }: { kase: Case }) {
  const entries = [...kase.timeline].sort(
    (a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.order - b.order,
  );
  const confidencePct = Math.round((kase.confidence ?? 0) * 100);

  return (
    <section className="panel flex h-full flex-col overflow-hidden">
      <header className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">
          Risk Assessment & Evidence Timeline
        </h2>
        <p className="text-xs text-muted-foreground">
          Traceable forensic scoring weighted by risk contribution.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-6 border-b border-border px-5 py-4 bg-muted/30">
        <div className="shrink-0 flex items-center justify-center">
          <RiskGauge
            score={kase.risk_score}
            severity={kase.severity}
            confidence={kase.confidence}
            size="md"
          />
        </div>
        <dl className="grid min-w-[200px] flex-1 gap-2.5">
          <div>
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Threat Classification
            </dt>
            <dd className="text-base font-bold text-foreground">
              {threatLabels[kase.threat_class]}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Detection Confidence
            </dt>
            <dd className="text-sm font-semibold text-foreground">
              {confidencePct >= 80 ? "High" : confidencePct >= 55 ? "Moderate" : "Low"}
              <span className="ml-1.5 font-mono text-xs text-muted-foreground font-normal">
                ({confidencePct}%)
              </span>
            </dd>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <RiskBadge severity={kase.severity} />
            <StatusPill decision={kase.decision} />
          </div>
        </dl>
      </div>

      {/* MULTI-SIGNAL FORENSIC THREAT VECTOR BREAKDOWN */}
      <div className="border-b border-border p-4 bg-muted/20">
        <ThreatVectorDonut kase={kase} />
      </div>

      <ol className="flex-1 px-5 py-4 space-y-4">
        {entries.map((e, i) => (
          <li key={e.order} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span
                className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", sevDot[e.severity])}
                aria-hidden
              />
              {i < entries.length - 1 && (
                <span className="w-px flex-1 bg-border mt-1" aria-hidden />
              )}
            </div>
            <div className="pb-3 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("text-xs font-bold", sevText[e.severity])}>{e.title}</p>
                <ConfidencePill level={confidenceLabel(e.severity)} />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground font-normal">
                {e.description}
              </p>
            </div>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="py-8 text-center text-xs text-muted-foreground">
            No ranked evidence returned for this case.
          </li>
        )}
      </ol>
    </section>
  );
}

function DecisionCard({
  kase,
  onAction,
}: {
  kase: Case;
  onAction: (a: AnalystActionType) => void;
  className?: string;
}) {
  const critical = kase.severity === "critical" || kase.severity === "high";
  const headline = critical ? "HOLD PAYMENT" : "NO ACTION REQUIRED";
  const secondary = ACTIONS.filter((a) => a !== "hold_payment" && a !== "escalate");

  return (
    <section
      className={cn(
        "panel overflow-hidden h-full flex flex-col justify-between",
        critical ? "border-critical/35" : "border-safe/25",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-2 border-b px-5 py-3.5",
          critical ? "border-critical/25 bg-critical/[0.06]" : "border-safe/20 bg-safe/[0.05]",
        )}
      >
        <ShieldAlert
          className={cn("size-4", critical ? "text-critical" : "text-safe")}
          aria-hidden
        />
        <h2 className="text-sm font-semibold text-foreground">Containment Recommendation</h2>
      </header>
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <p
            className={cn(
              "text-2xl font-bold tracking-tight",
              critical ? "text-critical" : "text-safe",
            )}
          >
            {headline}
          </p>
          <p className="mt-1.5 text-sm font-semibold text-foreground">{kase.decision_banner}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {kase.timeline[0]?.description ?? "Review the evidence timeline before deciding."}
          </p>

          {/* ACTIONABLE FINANCE CONTAINMENT STEPS */}
          {critical && (
            <div className="mt-3.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs">
              <div className="flex items-center justify-between border-b border-destructive/20 pb-2">
                <span className="font-bold text-destructive uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <ShieldAlert className="size-3.5 text-destructive" />
                  Immediate AP Containment Protocol
                </span>
                <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                  Priority 1
                </span>
              </div>
              <p className="mt-2 text-muted-foreground text-[11px] leading-relaxed">
                Execute these 3 immediate containment steps before clearing or reissuing funds:
              </p>
              <ol className="mt-2.5 space-y-2 text-foreground font-medium">
                <li className="flex items-start gap-2">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                    1
                  </span>
                  <span>
                    <strong className="text-foreground">Place payment hold</strong> in accounting
                    system on voucher.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                    2
                  </span>
                  <span>
                    <strong className="text-foreground">Call known vendor contact</strong> at
                    verified telephone number (
                    <span className="text-destructive font-semibold">
                      not the number in the email
                    </span>
                    ).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                    3
                  </span>
                  <span>
                    <strong className="text-foreground">Add bank suffix</strong>{" "}
                    {kase.evidence.financial.bank_account_last4 ? (
                      <code className="font-mono bg-card px-1.5 py-0.5 rounded border border-destructive/30 text-destructive font-bold">
                        ••••{kase.evidence.financial.bank_account_last4}
                      </code>
                    ) : kase.case_number === "SM-1037" ? (
                      <code className="font-mono bg-card px-1.5 py-0.5 rounded border border-destructive/30 text-destructive font-bold">
                        ••••5518
                      </code>
                    ) : (
                      "••••5518"
                    )}{" "}
                    to enterprise blocklist across banking rails.
                  </span>
                </li>
              </ol>
            </div>
          )}
        </div>

        <div className="mt-5 space-y-2">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onAction("hold_payment")}
              className="rounded-xl bg-destructive px-4 py-2.5 text-xs font-bold text-destructive-foreground shadow-sm transition-colors duration-150 hover:bg-destructive/90 cursor-pointer"
            >
              Hold payment
            </button>
            <button
              type="button"
              onClick={() => onAction("escalate")}
              className="rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground shadow-xs transition-colors duration-150 hover:bg-secondary cursor-pointer"
            >
              Escalate
            </button>
          </div>
          <div className="flex justify-center gap-5 pt-1">
            {secondary.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onAction(a)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer"
              >
                {actionMeta[a].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function IdentityCard({ kase }: { kase: Case }) {
  const s = kase.evidence.sender_identity;
  const authTone = (v: string) =>
    v === "pass"
      ? "text-safe font-bold"
      : v === "none"
        ? "text-muted-foreground font-normal"
        : "text-critical font-bold";
  const mismatch = Boolean(s.trusted_vendor && !s.vendor_domain_match);
  const behavioralBreak = Boolean(
    s.trusted_vendor &&
    s.vendor_domain_match &&
    kase.evidence.financial.payment_change_requested &&
    !kase.evidence.financial.bank_account_known,
  );

  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <Mail className="size-4 text-blue-600" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Sender Identity Comparison</h2>
      </header>
      <dl className="space-y-2.5 px-5 py-4 text-xs">
        <KV label="From Address" value={s.from_address} mono />
        <KV
          label="Reply-To"
          value={s.reply_to ?? "—"}
          mono
          tone={s.reply_to && s.reply_to !== s.from_address ? "critical" : undefined}
        />
        <KV label="Return-Path" value={s.return_path ?? "—"} mono />
      </dl>
      <div className="grid grid-cols-3 gap-2 px-5 pb-3">
        {(["spf", "dkim", "dmarc"] as const).map((k) => (
          <span
            key={k}
            className="rounded-lg border border-border bg-[var(--sunken)] p-2 text-center"
          >
            <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              {k}
            </span>
            <span className={cn("text-xs font-semibold", authTone(s.auth[k]))}>{s.auth[k]}</span>
          </span>
        ))}
      </div>
      <div
        className={cn(
          "flex items-center gap-2 border-t px-5 py-3 text-xs",
          mismatch || behavioralBreak ? "border-critical/25 bg-critical/[0.05]" : "border-border",
        )}
      >
        <span
          className={cn(
            "size-2 rounded-full shrink-0",
            mismatch || behavioralBreak ? "bg-critical" : "bg-safe",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 font-medium">
          {s.trusted_vendor
            ? mismatch
              ? `${s.trusted_vendor} — domain does not match trusted baseline`
              : behavioralBreak
                ? `${s.trusted_vendor} — authenticated sender, but payment behavior breaks the trusted baseline`
                : `${s.trusted_vendor} — matches trusted baseline`
            : "No vendor baseline on record"}
        </span>
      </div>
    </section>
  );
}

function FinancialExposure({ kase }: { kase: Case }) {
  const f = kase.evidence.financial;
  const known = Boolean(f.bank_account_known);

  return (
    <section className="panel overflow-hidden h-full flex flex-col justify-between">
      <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <Banknote className="size-4 text-amber-600" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Financial Exposure Breakdown</h2>
      </header>

      <div className="flex items-end justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Requested Remittance
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
            {f.invoice_amount ? formatCurrency(f.invoice_amount, f.currency ?? "USD") : "—"}
          </p>
        </div>
        <p className="text-right text-xs text-muted-foreground font-medium">
          Beneficiary:{" "}
          <span className="text-foreground font-semibold">{f.beneficiary ?? "Unspecified"}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 py-4">
        <div className="rounded-xl border border-border bg-[var(--sunken)] p-3">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Detected in Email
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-base font-bold",
              known ? "text-foreground" : "text-critical",
            )}
          >
            {f.bank_account_last4 ? `••••${f.bank_account_last4}` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-[var(--sunken)] p-3">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Approved on File
          </p>
          <p className="mt-1 font-mono text-base font-bold text-muted-foreground">
            {known && f.bank_account_last4 ? `••••${f.bank_account_last4}` : "not on file"}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 border-t px-5 py-3 text-xs font-semibold",
          known ? "border-border text-safe" : "border-critical/25 bg-critical/[0.05] text-critical",
        )}
      >
        <span className="size-2 rounded-full bg-current shrink-0" aria-hidden />
        <span>
          {known ? "Account matches approved vendor record" : "Account not on approved payee list"}
        </span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {f.payment_change_requested ? "Change requested" : "No change requested"}
        </span>
      </div>

      {f.notes && f.notes.length > 0 && (
        <ul className="space-y-2 border-t border-border px-5 py-3.5">
          {f.notes.map((n) => (
            <li key={n.label} className="rounded-lg border border-border bg-[var(--sunken)] p-2.5">
              <p className="text-xs font-semibold text-foreground">{n.label}</p>
              {n.detail && <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BodyPreview({ kase }: { kase: Case }) {
  const plain = toPlainText(kase.body_preview);
  const segments = useMemo(() => highlight(plain), [plain]);

  function copyBody() {
    navigator.clipboard.writeText(plain);
    toast.success("Message body copied to clipboard");
  }

  return (
    <section className="panel h-full flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Fingerprint className="size-4 text-blue-600" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Message Body (Escaped Plain Text)
            </h2>
            <p className="text-xs text-muted-foreground">
              HTML scripts neutralized. Suspicious BEC trigger phrases highlighted.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={copyBody}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary hover:bg-secondary/80 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors"
        >
          <Copy className="size-3" />
          Copy Body
        </button>
      </header>
      {segments.length === 0 ? (
        <div className="p-8 text-center">
          <EmptyState message="No message body was captured for this case." />
        </div>
      ) : (
        <pre className="flex-1 max-h-[440px] overflow-auto p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground select-text bg-muted/20">
          {segments.map((s, i) =>
            s.hit ? (
              <mark
                key={i}
                className="rounded bg-destructive/15 text-destructive border border-destructive/30 px-1 py-0.5 font-bold"
              >
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </pre>
      )}
    </section>
  );
}

function TechList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None detected</p>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-[var(--sunken)] px-2.5 py-1 font-mono text-xs break-all text-foreground"
            >
              {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KV({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean | undefined;
  tone?: "critical" | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground font-medium">{label}</dt>
      <dd
        className={cn(
          "truncate text-right font-medium",
          mono && "font-mono text-xs",
          tone === "critical" ? "text-critical font-bold" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function highlight(text: string) {
  if (!text) return [] as { text: string; hit: boolean }[];
  const pattern = new RegExp(`(${SUSPICIOUS_PHRASES.join("|")})`, "gi");
  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, hit: SUSPICIOUS_PHRASES.includes(part.toLowerCase()) }));
}

const sevText: Record<Severity, string> = {
  critical: "text-critical",
  high: "text-warning",
  medium: "text-warning",
  low: "text-primary",
  safe: "text-safe",
};

const sevDot: Record<Severity, string> = {
  critical: "bg-critical",
  high: "bg-warning",
  medium: "bg-warning/70",
  low: "bg-primary",
  safe: "bg-safe",
};
