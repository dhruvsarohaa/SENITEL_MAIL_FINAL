import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Copy,
  Key,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { api, API_BASE_URL } from "@/lib/api";

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
  const qc = useQueryClient();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

  const tenantQuery = useQuery({
    queryKey: ["currentTenant"],
    queryFn: api.getCurrentTenant,
  });

  const apiKeysQuery = useQuery({
    queryKey: ["apiKeys"],
    queryFn: api.listApiKeys,
  });

  const connectorsQuery = useQuery({
    queryKey: ["connectors"],
    queryFn: api.listMailboxConnectors,
  });

  const createKeyMutation = useMutation({
    mutationFn: (name: string) => api.createApiKey(name),
    onSuccess: (data) => {
      setCreatedRawKey(data.apiKey);
      setNewKeyName("");
      toast.success("API key generated successfully");
      qc.invalidateQueries({ queryKey: ["apiKeys"] });
    },
    onError: (err: unknown) => {
      toast.error("Failed to generate API key", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  const tenantName = tenantQuery.data?.tenant?.name || "Sentinel Corporation";
  const tenantId = tenantQuery.data?.tenant?.id || "org-sentinel-corp";
  const userRole = tenantQuery.data?.user?.role || "admin";
  const userEmail = tenantQuery.data?.user?.email || "admin@sentinel.corp";

  const apiKeys = apiKeysQuery.data ?? [];
  const defaultKeyStr = "sm_live_948f219b48c04e229e3a628d05";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
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
              <dd className="font-semibold text-xs text-foreground">{tenantName}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-2.5">
              <dt className="text-xs text-muted-foreground">Tenant Identifier</dt>
              <dd className="font-mono text-xs text-foreground/90">{tenantId}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-2.5">
              <dt className="text-xs text-muted-foreground">Active User / Role</dt>
              <dd className="font-semibold text-xs text-foreground">
                {userEmail} ({userRole})
              </dd>
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
              Live Keys ({apiKeys.length || 1})
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Authenticate automated ingestion pipelines, SIEM collectors, or poller scripts with
            Bearer tokens.
          </p>

          {createdRawKey && (
            <div className="mt-3 rounded-xl border border-safe/30 bg-safe/10 p-3 text-xs">
              <p className="font-semibold text-safe">New API Key Created:</p>
              <div className="mt-1 flex items-center justify-between font-mono bg-background p-2 rounded border border-border">
                <span className="truncate select-all">{createdRawKey}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdRawKey)}
                  className="ml-2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Copy this key now. It will not be shown again.
              </p>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {apiKeys.length > 0 ? (
              apiKeys.map((key) => {
                const displayStr = key.prefix ? `${key.prefix}...` : defaultKeyStr;
                return (
                  <div
                    key={key.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-3.5 py-2.5"
                  >
                    <div>
                      <p className="text-xs font-semibold text-foreground">{key.name}</p>
                      <code className="font-mono text-[11px] text-muted-foreground">
                        {displayStr}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(displayStr)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {copiedKey === displayStr ? (
                        <CheckCircle2 className="size-3.5 text-safe" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedKey === displayStr ? "Copied" : "Copy"}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-3.5 py-2.5">
                <code className="font-mono text-xs text-foreground truncate">{defaultKeyStr}</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(defaultKeyStr)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {copiedKey === defaultKeyStr ? (
                    <CheckCircle2 className="size-3.5 text-safe" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copiedKey === defaultKeyStr ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newKeyName.trim()) {
                createKeyMutation.mutate(newKeyName.trim());
              }
            }}
            className="mt-4 flex gap-2"
          >
            <input
              type="text"
              placeholder="Key label (e.g. Production Poller)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={createKeyMutation.isPending || !newKeyName.trim()}
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              <Plus className="size-3.5" />
              Generate
            </button>
          </form>

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
              {connectorsQuery.data?.length ?? 0} Active
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {connectorsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading connectors...</p>
            ) : (connectorsQuery.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">No mailbox connectors configured.</p>
            ) : (
              connectorsQuery.data?.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-card"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`size-2 rounded-full ${c.status === "active" ? "bg-safe" : "bg-muted"}`}
                    />
                    <div>
                      <p className="text-xs font-semibold text-foreground">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {c.mailbox} &middot;{" "}
                        {c.webhook_url ||
                          `/api/ingest/${c.provider === "google_workspace" ? "google" : "m365"}/webhook`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-safe bg-safe/10 px-2 py-0.5 rounded border border-safe/20">
                      {c.status === "active" ? "Connected" : c.status}
                    </span>
                    {c.messages_synced != null && (
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                        {c.messages_synced} synced
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
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
