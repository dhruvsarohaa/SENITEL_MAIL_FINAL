import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  Copy,
  Key,
  Lock,
  Mail,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { API_BASE_URL } from "@/lib/api";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SentinelMail configuration" },
      {
        name: "description",
        content: "Multi-tenant configuration, API keys, mailbox connectors and privacy controls.",
      },
      { property: "og:title", content: "Settings — SentinelMail configuration" },
      { property: "og:description", content: "Enterprise tenant and connector settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [copiedKey, setCopiedKey] = useState(false);
  const sampleKey = "sm_live_948f219b48c04e229e3a628d05";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <AppShell breadcrumb={["Settings"]}>
      <PageHeader
        title="Enterprise Settings"
        description="Tenant partitioning, API credentials, native mailbox connectors and defense policies."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* TENANT IDENTITY */}
        <section className="panel p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Building2 className="size-4 text-foreground" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Tenant Organization</h2>
            </div>
            <span className="rounded-full bg-safe/10 border border-safe/20 px-2.5 py-0.5 text-[10px] font-semibold text-safe">
              SOC 2 Isolated
            </span>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-2.5">
              <dt className="text-xs text-muted-foreground">Organization Name</dt>
              <dd className="font-semibold text-xs text-foreground">Sentinel Corporation</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-2.5">
              <dt className="text-xs text-muted-foreground">Tenant Identifier</dt>
              <dd className="font-mono text-xs text-foreground/90">org-sentinel-corp</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-2.5">
              <dt className="text-xs text-muted-foreground">Active Role</dt>
              <dd className="font-semibold text-xs text-foreground">Administrator (admin)</dd>
            </div>
            <div className="flex items-center justify-between gap-4 pb-1">
              <dt className="text-xs text-muted-foreground">Autonomous Policy</dt>
              <dd className="text-xs font-medium text-safe">Auto-hold risk &ge; 70 enabled</dd>
            </div>
          </dl>
        </section>

        {/* API CREDENTIALS */}
        <section className="panel p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Key className="size-4 text-foreground" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Programmatic Ingestion Keys</h2>
            </div>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
              Live Keys
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Authenticate automated ingestion pipelines, SIEM collectors, or poller scripts with
            Bearer tokens.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-3.5 py-2.5">
            <code className="font-mono text-xs text-foreground truncate">{sampleKey}</code>
            <button
              type="button"
              onClick={() => copyToClipboard(sampleKey)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {copiedKey ? (
                <CheckCircle2 className="size-3.5 text-safe" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copiedKey ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground font-mono bg-secondary/60 p-2 rounded-lg border border-border">
            Authorization: Bearer sm_live_...
          </div>
        </section>

        {/* MAILBOX GATEWAYS */}
        <section className="panel p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Mail className="size-4 text-foreground" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">
                Mailbox Ingestion Connectors
              </h2>
            </div>
            <span className="rounded-full bg-safe/10 border border-safe/20 px-2.5 py-0.5 text-[10px] font-semibold text-safe">
              2 Active
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-safe" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Microsoft 365 Graph Webhook
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    /api/ingest/m365/webhook
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-safe bg-safe/10 px-2 py-0.5 rounded border border-safe/20">
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-safe" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Google Cloud Pub/Sub Push</p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    /api/ingest/google/push
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-safe bg-safe/10 px-2 py-0.5 rounded border border-safe/20">
                Connected
              </span>
            </div>
          </div>
        </section>

        {/* ANALYSIS BACKEND & PRIVACY */}
        <section className="panel p-6">
          <div className="flex items-center gap-2.5">
            <Lock className="size-4 text-safe" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">
              Data Privacy &amp; Forensic Safeguards
            </h2>
          </div>
          <ul className="mt-4 space-y-3 text-xs text-muted-foreground">
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-safe" aria-hidden />
              Tenant emails are segregated via database row-level boundaries and never shared across
              tenants.
            </li>
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-safe" aria-hidden />
              Email bodies are strictly parsed as sanitized plain text — HTML, scripts, and trackers
              are stripped.
            </li>
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-safe" aria-hidden />
              Suspicious attachments are hashed with SHA-256 for IOC tracking and never executed on
              the host.
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
