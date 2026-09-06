import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  Globe,
  Mail,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import {
  AppShell,
  ConnectionNotice,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/AppShell";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { VendorProfile } from "@/types/sentinel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vendors")({
  head: () => ({
    meta: [
      { title: "Vendor profiles — SentinelMail" },
      {
        name: "description",
        content:
          "Trusted vendor directory with approved domains, contacts, bank-account suffixes and recent payment anomalies.",
      },
      { property: "og:title", content: "Vendor profiles — SentinelMail" },
      {
        property: "og:description",
        content: "Trusted vendor baselines for payment-fraud detection.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VendorsPage,
});

const riskStyles = {
  trusted: "border-safe/20 bg-safe/10 text-safe",
  watch: "border-warning/20 bg-warning/10 text-warning",
  at_risk: "border-destructive/20 bg-destructive/10 text-destructive",
} as const;

const riskLabels = { trusted: "Trusted", watch: "Watchlist", at_risk: "At Risk" } as const;

function VendorsPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["vendors"], queryFn: api.listVendors });
  const vendors = query.data?.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const selected = vendors.find((v) => v.id === selectedId) ?? null;

  const createVendor = useMutation({
    mutationFn: api.createVendor,
    onSuccess: () => {
      toast.success("Vendor profile created successfully");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (err: unknown) =>
      toast.error("Could not create vendor", {
        description: err instanceof Error ? err.message : undefined,
      }),
  });

  // KPI Calculations
  const totalApprovedSuffixes = useMemo(
    () => vendors.reduce((acc, v) => acc + (v.approved_bank_suffixes?.length || 0), 0),
    [vendors],
  );

  const watchCount = useMemo(
    () => vendors.filter((v) => v.risk_state === "watch" || v.risk_state === "at_risk").length,
    [vendors],
  );

  const trustedCount = useMemo(
    () => vendors.filter((v) => v.risk_state === "trusted" || !v.risk_state).length,
    [vendors],
  );

  // Search and Filter
  const filteredVendors = useMemo(() => {
    return vendors.filter((v) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "trusted" && (v.risk_state === "trusted" || !v.risk_state)) ||
        v.risk_state === statusFilter;

      const q = search.toLowerCase().trim();
      if (!q) return matchesStatus;

      const matchesName = v.name.toLowerCase().includes(q);
      const matchesDomain = v.trusted_domains?.some((d) => d.toLowerCase().includes(q));
      const matchesContact = v.trusted_contacts?.some((c) => c.toLowerCase().includes(q));
      const matchesSuffix = v.approved_bank_suffixes?.some((s) => s.includes(q));

      return matchesStatus && (matchesName || matchesDomain || matchesContact || matchesSuffix);
    });
  }, [vendors, search, statusFilter]);

  return (
    <AppShell breadcrumb={["Vendor profiles"]}>
      <PageHeader
        title="Trusted Vendor Identity Directory"
        description="Zero-trust baseline registry for corporate suppliers, approved remittance banking accounts, and historical communication profiles."
        actions={
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Plus className="size-4" aria-hidden />
            Register Supplier Profile
          </button>
        }
      />

      {/* KPI METRIC STRIP */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Registered Suppliers</span>
            <span className="rounded bg-safe/10 px-2 py-0.5 text-xs font-semibold text-safe">
              {trustedCount} Trusted
            </span>
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {vendors.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground font-medium">
              Monitored supplier baselines
            </p>
          </div>
        </div>

        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Approved Bank Suffixes</span>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Zero-Trust
            </span>
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {totalApprovedSuffixes}
            </p>
            <p className="mt-1 text-xs text-muted-foreground font-medium">
              Verified payout accounts
            </p>
          </div>
        </div>

        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Active Watchlist</span>
            <span
              className={cn(
                "rounded px-2 py-0.5 text-xs font-semibold",
                watchCount > 0
                  ? "bg-warning/10 text-warning"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              {watchCount > 0 ? "Anomalies" : "Clean"}
            </span>
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {watchCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground font-medium">
              Heightened scrutiny profiles
            </p>
          </div>
        </div>

        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Remittance Gate</span>
            <span className="rounded bg-safe/10 px-2 py-0.5 text-xs font-semibold text-safe">
              Active
            </span>
          </div>
          <div className="mt-3">
            <p className="text-base font-bold text-foreground truncate">Continuous Audit</p>
            <p className="mt-1 text-xs text-safe font-medium">Automatic hold on bank change</p>
          </div>
        </div>
      </div>

      {query.isError && <ConnectionNotice error={query.error} onRetry={() => query.refetch()} />}

      {/* SEARCH AND FILTER BAR */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[280px] max-w-md flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search suppliers by name, domain, contact, or bank suffix..."
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
          {(["all", "trusted", "watch", "at_risk"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors duration-150 cursor-pointer",
                statusFilter === st
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {st === "all" ? "All Suppliers" : st === "at_risk" ? "At Risk" : st}
            </button>
          ))}
        </div>
      </div>

      {/* DIRECTORY GRID (MAIN LIST + DETAIL ASIDE) */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel overflow-hidden">
          <header className="border-b border-border bg-muted/40 px-5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Verified Vendor Directory ({filteredVendors.length})
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                Click a supplier to view full baseline
              </span>
            </div>
          </header>

          {query.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="p-8 text-center">
              <EmptyState
                icon={Building2}
                message={
                  search || statusFilter !== "all"
                    ? "No vendor profiles match the active search or filters."
                    : "No vendor profiles registered yet. Add your trusted suppliers to enforce automated payment verification."
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredVendors.map((v) => {
                const risk = (v.risk_state as keyof typeof riskStyles) ?? "trusted";
                const isSelected = selectedId === v.id;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left transition-all duration-150 cursor-pointer",
                        isSelected
                          ? "bg-secondary/90 border-l-4 border-primary"
                          : "hover:bg-secondary/50 border-l-4 border-transparent",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-4 text-muted-foreground shrink-0" />
                          <p className="truncate text-sm font-semibold text-foreground">{v.name}</p>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
                          <span className="truncate">
                            <span className="font-sans font-medium text-foreground/80">
                              Domains:
                            </span>{" "}
                            {v.trusted_domains.join(", ") || "None"}
                          </span>
                          <span>·</span>
                          <span>{v.trusted_contacts.length} contacts</span>
                          <span>·</span>
                          <span className="font-sans font-semibold text-foreground/90">
                            Accts: {v.approved_bank_suffixes.map((s) => `••${s}`).join(", ") || "—"}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="hidden text-xs text-muted-foreground sm:block font-medium">
                          {v.last_interaction ? relativeTime(v.last_interaction) : "—"}
                        </span>
                        <span
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-xs font-semibold",
                            riskStyles[risk],
                          )}
                        >
                          {riskLabels[risk]}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ASIDE: DETAILED VENDOR INSPECTOR OR DIRECTORY OVERVIEW */}
        <aside>
          <div className="panel sticky top-[84px] p-5 shadow-xs">
            {selected ? (
              <VendorDetail vendor={selected} onAddNew={() => setShowForm(true)} />
            ) : (
              <DirectoryOverview totalVendors={vendors.length} onAddNew={() => setShowForm(true)} />
            )}
          </div>
        </aside>
      </div>

      {showForm && (
        <VendorModal
          pending={createVendor.isPending}
          onClose={() => setShowForm(false)}
          onSubmit={(v) => createVendor.mutate(v)}
        />
      )}
    </AppShell>
  );
}

function DirectoryOverview({
  totalVendors,
  onAddNew,
}: {
  totalVendors: number;
  onAddNew: () => void;
}) {
  return (
    <div className="space-y-5">
      <header className="border-b border-border pb-3.5">
        <h2 className="text-sm font-semibold text-foreground">Directory Overview & Protection</h2>
        <p className="text-xs text-muted-foreground">Automated behavioral verification baseline</p>
      </header>

      <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <ShieldCheck className="size-4 text-safe" />
          Zero-Trust Payee Matching Active
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Every inbound invoice and wire remittance request is matched against the supplier's
          approved banking account suffixes and historical senders.
        </p>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Autonomous Interception Rules
        </h3>
        <ul className="space-y-2 text-xs text-foreground/90">
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive" />
            <span>
              <strong className="font-semibold text-foreground">Unapproved Account:</strong> Any
              remittance destination not registered in the approved suffixes list generates an
              immediate payment hold.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-warning" />
            <span>
              <strong className="font-semibold text-foreground">Lookalike Domain:</strong> Senders
              claiming to be from a supplier but originating from an unapproved domain are
              escalated.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="font-semibold text-foreground">Reply-To Hijack:</strong> Mismatched
              reply-to addresses automatically trigger multi-case correlation across tenants.
            </span>
          </li>
        </ul>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={onAddNew}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 cursor-pointer"
        >
          <Plus className="size-3.5" />
          Add Supplier Profile
        </button>
      </div>
    </div>
  );
}

function VendorDetail({ vendor, onAddNew }: { vendor: VendorProfile; onAddNew: () => void }) {
  const risk = (vendor.risk_state as keyof typeof riskStyles) ?? "trusted";

  return (
    <div className="space-y-4">
      <header className="border-b border-border pb-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-foreground">{vendor.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground font-medium">
              {vendor.relationship_since
                ? `Relationship since ${formatDateTime(vendor.relationship_since)}`
                : "Baseline supplier record"}
            </p>
          </div>
          <span
            className={cn("rounded-md border px-2.5 py-1 text-xs font-semibold", riskStyles[risk])}
          >
            {riskLabels[risk]}
          </span>
        </div>
      </header>

      <Block title="Trusted Domains" icon={Globe} items={vendor.trusted_domains} chipTone="slate" />
      <Block
        title="Approved Billing Contacts"
        icon={UserCheck}
        items={vendor.trusted_contacts}
        chipTone="slate"
      />
      <Block
        title="Approved Payee Account Suffixes"
        icon={CreditCard}
        items={vendor.approved_bank_suffixes.map((s) => `••••${s}`)}
        chipTone="blue"
      />
      <Block
        title="Normal Internal Recipients"
        icon={Mail}
        items={vendor.normal_recipients}
        chipTone="slate"
      />

      {vendor.anomalies && vendor.anomalies.length > 0 && (
        <div className="pt-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-destructive flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" />
            Flagged Behavioral Anomalies
          </h3>
          <ul className="space-y-2">
            {vendor.anomalies.map((a) => (
              <li
                key={a.label}
                className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs"
              >
                <p className="font-semibold text-destructive">{a.label}</p>
                {a.detail && (
                  <p className="mt-0.5 text-destructive/90 leading-relaxed">{a.detail}</p>
                )}
                {a.at && (
                  <p className="mt-1 text-[10px] text-muted-foreground font-medium">
                    {relativeTime(a.at)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Block({
  title,
  icon: Icon,
  items,
  chipTone = "slate",
}: {
  title: string;
  icon?: typeof Globe;
  items: string[];
  chipTone?: "slate" | "blue";
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="size-3 text-muted-foreground" />}
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None configured</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <li
              key={i}
              className={cn(
                "rounded-lg border px-2.5 py-1 font-mono text-xs break-all font-medium",
                chipTone === "blue"
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-border bg-[var(--sunken)] text-foreground",
              )}
            >
              {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VendorModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (v: Omit<VendorProfile, "id">) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [domains, setDomains] = useState("");
  const [contacts, setContacts] = useState("");
  const [suffixes, setSuffixes] = useState("");

  const split = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/55 backdrop-blur-xs">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSubmit({
            name: name.trim(),
            trusted_domains: split(domains),
            trusted_contacts: split(contacts),
            approved_bank_suffixes: split(suffixes),
            normal_recipients: [],
          });
        }}
        className="panel relative w-full max-w-md p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-border pb-3.5">
          <div>
            <h2 className="text-base font-bold text-foreground">Register Supplier Baseline</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Configure authorized domains and approved remittance bank suffixes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <Field
            label="Supplier / Vendor Organization Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Aster Manufacturing Inc."
            required
          />
          <Field
            label="Authorized Email Domains (comma separated)"
            value={domains}
            onChange={setDomains}
            placeholder="e.g. aster-mfg.com, mail.aster-mfg.com"
          />
          <Field
            label="Known Billing Contacts (comma separated)"
            value={contacts}
            onChange={setContacts}
            placeholder="e.g. billing@aster-mfg.com, ap@aster-mfg.com"
          />
          <Field
            label="Approved Bank Account Suffixes (last 4 digits)"
            value={suffixes}
            onChange={setSuffixes}
            placeholder="e.g. 1142, 9082"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2.5 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 disabled:opacity-45 cursor-pointer"
          >
            {pending ? "Registering…" : "Register Supplier Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-sm"
      />
    </label>
  );
}
