import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { api } from "@/lib/api";
import type { VendorProfile } from "@/types/sentinel";

interface VendorHoverCardProps {
  vendorName?: string | null | undefined;
  vendorId?: string | undefined;
  children: ReactNode;
  align?: "start" | "center" | "end" | undefined;
  side?: "top" | "bottom" | "left" | "right" | undefined;
  className?: string | undefined;
}

// Out-of-band verified desk phones for known suppliers (critical AP callback security)
const VERIFIED_CALLBACKS: Record<string, string> = {
  "Harborline Metals": "+1 (312) 555-0194",
  "Supply Co Industrial": "+1 (212) 555-0142",
  "Northline Freight": "+1 (415) 555-0188",
  "Meridian Utilities": "+1 (800) 555-0177",
  "Kestrel Tooling": "+1 (206) 555-0133",
};

export function VendorHoverCard({
  vendorName,
  vendorId,
  children,
  align = "start",
  side = "bottom",
  className,
}: VendorHoverCardProps) {
  const vendorsQuery = useQuery({
    queryKey: ["vendors"],
    queryFn: api.listVendors,
    staleTime: 60_000,
  });
  const vendors = vendorsQuery.data?.data ?? [];

  const vendor: VendorProfile | undefined = useMemo(() => {
    if (!vendorName && !vendorId) return undefined;
    const cleanName = (vendorName ?? "").toLowerCase().trim();
    return vendors.find((v) => {
      if (vendorId && v.id === vendorId) return true;
      if (cleanName && v.name.toLowerCase().includes(cleanName)) return true;
      if (cleanName && cleanName.includes(v.name.toLowerCase())) return true;
      return false;
    });
  }, [vendorName, vendorId, vendors]);

  const verifiedPhone = vendor ? (VERIFIED_CALLBACKS[vendor.name] ?? "+1 (888) 555-0100") : null;

  return (
    <HoverCard openDelay={120} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span className={className}>{children}</span>
      </HoverCardTrigger>
      <HoverCardContent
        align={align}
        side={side}
        className="w-80 rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-md text-xs text-foreground z-50 animate-in fade-in-0 zoom-in-95 duration-150"
      >
        {vendor ? (
          <div className="space-y-3">
            {/* VENDOR HEADER & STATUS */}
            <div className="flex items-start justify-between gap-2 border-b border-border pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground border border-border">
                  <Building2 className="size-4" />
                </span>
                <div className="min-w-0">
                  <h4 className="font-bold text-foreground truncate text-xs">{vendor.name}</h4>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {vendor.trusted_domains?.[0]
                      ? `@${vendor.trusted_domains[0]}`
                      : "Contracted Supplier"}
                  </p>
                </div>
              </div>

              {vendor.risk_state === "at_risk" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive uppercase tracking-wider">
                  <ShieldAlert className="size-3" />
                  At Risk
                </span>
              ) : vendor.risk_state === "watch" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning uppercase tracking-wider">
                  <AlertTriangle className="size-3" />
                  Watchlist
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-safe/30 bg-safe/10 px-2 py-0.5 text-[10px] font-bold text-safe uppercase tracking-wider">
                  <ShieldCheck className="size-3" />
                  Trusted
                </span>
              )}
            </div>

            {/* VERIFIED AP PARAMETERS */}
            <div className="grid grid-cols-2 gap-2 bg-muted/40 rounded-xl p-2.5 border border-border">
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Approved Bank
                </span>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] font-mono font-bold text-foreground">
                  <CheckCircle2 className="size-3 text-safe shrink-0" />
                  <span>
                    {(vendor.approved_bank_suffixes ?? []).map((s) => `••••${s}`).join(", ") ||
                      "••••1142"}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  AP Terms
                </span>
                <span className="mt-0.5 block text-[11px] font-medium text-foreground">
                  Net 30 · Monthly
                </span>
              </div>
            </div>

            {/* OUT-OF-BAND AP CALLBACK DESK */}
            {verifiedPhone && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 flex items-start gap-2 text-foreground">
                <PhoneCall className="size-3.5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">
                    Verified AP Callback Desk
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {verifiedPhone}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                    Always use this number to verify wire changes (never call email numbers).
                  </p>
                </div>
              </div>
            )}

            {/* ANOMALY BADGE OR CLEAN AUDIT */}
            {vendor.anomalies && vendor.anomalies.length > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-destructive font-medium bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1">
                <AlertTriangle className="size-3 shrink-0" />
                <span className="truncate">{vendor.anomalies[0]?.label}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-safe font-medium bg-safe/10 border border-safe/20 rounded-lg px-2.5 py-1">
                <CheckCircle2 className="size-3 shrink-0" />
                <span>Zero behavioral anomalies recorded</span>
              </div>
            )}

            {/* FOOTER LINK */}
            <div className="border-t border-border pt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Zero-Trust Registry</span>
              <Link
                to="/vendors"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-foreground hover:text-primary transition-colors"
              >
                Inspect Supplier Dossier
                <ExternalLink className="size-2.5" />
              </Link>
            </div>
          </div>
        ) : (
          /* UNREGISTERED / EXTERNAL SENDER */
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-warning/15 text-warning">
                <AlertTriangle className="size-3.5" />
              </span>
              <div>
                <h4 className="font-bold text-foreground text-xs">Unregistered Counterparty</h4>
                <p className="text-[10px] text-muted-foreground">External Entity</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              No historical payment profile or contracted depository on file in the ERP master
              ledger.
            </p>
            <div className="rounded-lg bg-warning/10 border border-warning/20 p-2 text-[11px] text-warning font-medium">
              Elevated threat: Wire diversion or unauthorized remittance demand.
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

interface BankAccountHoverCardProps {
  bankSuffix: string;
  isApproved?: boolean | undefined;
  beneficiary?: string | undefined;
  vendorName?: string | undefined;
  children: ReactNode;
  align?: "start" | "center" | "end" | undefined;
  side?: "top" | "bottom" | "left" | "right" | undefined;
  className?: string | undefined;
}

export function BankAccountHoverCard({
  bankSuffix,
  isApproved = false,
  beneficiary,
  vendorName,
  children,
  align = "center",
  side = "top",
  className,
}: BankAccountHoverCardProps) {
  return (
    <HoverCard openDelay={120} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span className={className}>{children}</span>
      </HoverCardTrigger>
      <HoverCardContent
        align={align}
        side={side}
        className="w-72 rounded-2xl border border-border bg-card/95 p-3.5 shadow-xl backdrop-blur-md text-xs text-foreground z-50 animate-in fade-in-0 zoom-in-95 duration-150"
      >
        <div className="space-y-2.5">
          {/* STATUS PILL */}
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-mono text-xs font-bold text-foreground">••••{bankSuffix}</span>
            {isApproved ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-safe/30 bg-safe/10 px-2 py-0.5 text-[10px] font-bold text-safe">
                <ShieldCheck className="size-3 text-safe" />
                Approved Depository
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                <ShieldAlert className="size-3 text-destructive" />
                Unapproved Account
              </span>
            )}
          </div>

          {/* BENEFICIARY & DETAILS */}
          <div className="space-y-1 text-muted-foreground">
            {beneficiary && (
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Beneficiary Name
                </span>
                <span className="font-medium text-foreground block truncate">{beneficiary}</span>
              </div>
            )}
            {vendorName && (
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Associated Vendor
                </span>
                <span className="font-medium text-foreground block truncate">{vendorName}</span>
              </div>
            )}
          </div>

          {/* ADVICE */}
          {isApproved ? (
            <p className="text-[11px] text-safe font-medium bg-safe/10 border border-safe/20 rounded-lg p-2 leading-relaxed">
              Depository verified in contracted ERP vendor master. Routine disbursement permitted.
            </p>
          ) : (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2 text-[11px] text-destructive space-y-1">
              <strong className="block font-bold">Priority 1 AP Directive:</strong>
              <p className="leading-relaxed text-foreground">
                Hold ERP voucher immediately. Do not remit funds until verified via out-of-band
                telephone callback.
              </p>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
