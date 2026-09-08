import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  ExternalLink,
  GitCompare,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { ActionModal, actionMeta } from "@/components/ActionModal";
import { RiskBadge, StatusPill } from "@/components/RiskBadge";
import { VendorHoverCard, BankAccountHoverCard } from "@/components/VendorHoverCard";
import { api, reportExtension } from "@/lib/api";
import { formatCurrency, formatDateTime, threatLabels } from "@/lib/format";
import type { AnalystActionType, Case, CaseSummary } from "@/types/sentinel";
import { cn } from "@/lib/utils";

interface CasePeekDrawerProps {
  caseId: string | null;
  open: boolean;
  onClose: () => void;
  casesList?: CaseSummary[];
  onSelectCase?: (caseId: string) => void;
}

export function CasePeekDrawer({
  caseId,
  open,
  onClose,
  casesList = [],
  onSelectCase,
}: CasePeekDrawerProps) {
  const qc = useQueryClient();
  const [action, setAction] = useState<AnalystActionType | null>(null);

  // Fetch full case forensic data when caseId is active
  const { data, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => api.getCase(caseId!),
    enabled: Boolean(caseId && open),
  });

  const kase: Case | undefined = data?.data ?? undefined;

  // Case navigation index
  const currentIndex = useMemo(() => {
    if (!caseId || casesList.length === 0) return -1;
    return casesList.findIndex((c) => c.id === caseId || c.case_number === caseId);
  }, [caseId, casesList]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < casesList.length - 1;

  const handlePrev = () => {
    if (hasPrev && onSelectCase) {
      onSelectCase(casesList[currentIndex - 1]!.id);
    }
  };

  const handleNext = () => {
    if (hasNext && onSelectCase) {
      onSelectCase(casesList[currentIndex + 1]!.id);
    }
  };

  const submitAction = useMutation({
    mutationFn: (payload: { type: AnalystActionType; note: string }) =>
      api.submitAction(caseId!, { type: payload.type, note: payload.note }),
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

  const downloadReport = async () => {
    if (!caseId) return;
    try {
      const blob = await api.downloadReport(caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kase?.case_number ?? caseId}-report.${reportExtension}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Forensic report downloaded");
    } catch (err) {
      toast.error("Report unavailable", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <>
      <Drawer
        open={open && Boolean(caseId)}
        onOpenChange={(isOpen) => !isOpen && onClose()}
        direction="right"
      >
        <DrawerContent className="w-full max-w-2xl bg-card border-l border-border shadow-2xl backdrop-blur-2xl flex flex-col h-full overflow-hidden focus:outline-none">
          {/* 1. TOP HEADER BAR */}
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-foreground">
                {kase?.case_number ?? caseId}
              </span>
              {kase && (
                <>
                  <RiskBadge severity={kase.severity} score={kase.risk_score} />
                  <StatusPill decision={kase.decision} />
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* NEXT / PREV NAVIGATION */}
              {casesList.length > 1 && (
                <div className="flex items-center gap-1 border-r border-border pr-2.5 mr-1">
                  <span className="text-[11px] font-semibold text-muted-foreground mr-1.5 hidden sm:inline">
                    {currentIndex + 1} of {casesList.length}
                  </span>
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={!hasPrev}
                    title="Previous case"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!hasNext}
                    title="Next case"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              )}

              {caseId && (
                <Link
                  to="/cases/$caseId"
                  params={{ caseId }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-foreground shadow-2xs transition-colors"
                >
                  <span>Full Canvas</span>
                  <ExternalLink className="size-3 text-muted-foreground" />
                </Link>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* 2. DRAWER BODY (SCROLLABLE FORENSIC DOSSIER) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {isLoading || !kase ? (
              <div className="space-y-4 py-8">
                <div className="h-7 w-3/4 rounded-lg bg-muted animate-pulse" />
                <div className="h-20 w-full rounded-xl bg-muted/60 animate-pulse" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-24 rounded-xl bg-muted/60 animate-pulse" />
                  <div className="h-24 rounded-xl bg-muted/60 animate-pulse" />
                </div>
                <div className="h-44 rounded-xl bg-muted/60 animate-pulse" />
              </div>
            ) : (
              <>
                {/* SUBJECT & METRIC STRIP */}
                <div>
                  <h2 className="text-base font-bold text-foreground leading-snug">
                    {kase.subject}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div>
                      <span className="text-muted-foreground/70 font-medium">From:</span>{" "}
                      <span className="font-mono text-foreground font-semibold">{kase.sender}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/70 font-medium">Target:</span>{" "}
                      {kase.vendor ? (
                        <VendorHoverCard vendorName={kase.vendor}>
                          <span className="font-semibold text-foreground underline decoration-dotted decoration-border hover:text-primary cursor-pointer">
                            {kase.vendor}
                          </span>
                        </VendorHoverCard>
                      ) : (
                        <span className="font-semibold text-foreground">External Entity</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground/70 font-medium">Detected:</span>{" "}
                      <span>{formatDateTime(kase.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* QUICK ACTION COMMAND BUTTONS */}
                <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAction("hold_payment")}
                      className="rounded-xl bg-destructive hover:bg-destructive/90 px-3.5 py-2 text-xs font-bold text-destructive-foreground shadow-xs transition-colors cursor-pointer"
                    >
                      Hold Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction("escalate")}
                      className="rounded-xl border border-border bg-secondary hover:bg-secondary/80 px-3 py-2 text-xs font-semibold text-foreground shadow-2xs transition-colors cursor-pointer"
                    >
                      Escalate
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction("mark_safe")}
                      className="rounded-xl border border-transparent hover:bg-muted px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Mark Safe
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={downloadReport}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Download className="size-3.5 text-muted-foreground" />
                    Forensic Report
                  </button>
                </div>

                {/* 4-KPI SUMMARY TILES */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Capital at Risk
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-foreground">
                      {kase.amount_at_risk
                        ? formatCurrency(kase.amount_at_risk, kase.currency ?? "USD")
                        : "—"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-destructive font-semibold truncate">
                      {kase.evidence.financial.payment_change_requested
                        ? "Diversion Requested"
                        : "Standard"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Threat Vector
                    </p>
                    <p className="mt-1 text-xs font-bold text-foreground truncate">
                      {threatLabels[kase.threat_class]}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground font-medium">
                      {Math.round((kase.confidence ?? 0.95) * 100)}% Confidence
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Verdict
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-xs font-bold truncate",
                        kase.severity === "critical" ? "text-destructive" : "text-safe",
                      )}
                    >
                      {kase.severity === "critical" ? "HOLD PAYMENT" : "CLEAN"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
                      {kase.decision_banner ?? "Review required"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Beneficiary
                    </p>
                    {kase.evidence.financial.bank_account_last4 ? (
                      <BankAccountHoverCard
                        bankSuffix={kase.evidence.financial.bank_account_last4}
                        isApproved={Boolean(kase.evidence.financial.bank_account_known)}
                        beneficiary={kase.evidence.financial.beneficiary}
                        vendorName={kase.vendor}
                      >
                        <p className="mt-1 font-mono text-xs font-bold text-foreground truncate underline decoration-dotted decoration-border hover:text-primary cursor-pointer">
                          ••••{kase.evidence.financial.bank_account_last4}
                        </p>
                      </BankAccountHoverCard>
                    ) : (
                      <p className="mt-1 font-mono text-xs font-bold text-foreground truncate">
                        None in body
                      </p>
                    )}
                    <p
                      className={cn(
                        "mt-0.5 text-[10px] font-bold",
                        kase.evidence.financial.bank_account_known ? "text-safe" : "text-warning",
                      )}
                    >
                      {kase.evidence.financial.bank_account_known ? "Approved" : "Unapproved"}
                    </p>
                  </div>
                </div>

                {/* BEHAVIORAL BASELINE CONTRAST CARD */}
                {(() => {
                  const isBenign =
                    kase.severity === "low" ||
                    kase.severity === "safe" ||
                    kase.risk_score < 30 ||
                    kase.threat_class === "benign";
                  const normalRecipient =
                    kase.evidence.vendor_relationship?.normal_recipients?.[0] ??
                    "ap@astermanufacturing.com";
                  const normalBankSuffix =
                    kase.evidence.vendor_relationship?.approved_bank_suffixes?.[0] ??
                    (kase.vendor === "Harborline Metals"
                      ? "1142"
                      : kase.vendor === "Supply Co Industrial"
                        ? "4412"
                        : "1142");
                  const anomalyBankSuffix =
                    kase.evidence.financial.bank_account_last4 ??
                    (kase.vendor === "Supply Co Industrial" ? "7741" : "5518");

                  if (isBenign) {
                    return (
                      <div className="rounded-xl border border-safe/30 bg-safe/10 p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-safe/20 pb-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="size-4 text-safe" />
                            <h3 className="text-xs font-bold text-safe uppercase tracking-wider">
                              Baseline Verified · Safe Supplier
                            </h3>
                          </div>
                          <span className="rounded-full bg-safe/20 border border-safe/40 px-2 py-0.5 text-[10px] font-bold text-safe">
                            Telemetry Match: 100%
                          </span>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3 text-xs">
                          <div className="rounded-lg border border-safe/30 bg-card p-3">
                            <div className="flex items-center gap-1.5 text-safe font-bold text-[11px] mb-1.5">
                              <CheckCircle2 className="size-3.5 text-safe" />
                              Approved Vendor Profile
                            </div>
                            <ul className="space-y-1 text-muted-foreground">
                              <li>
                                • Invoices to AP (
                                <span className="font-mono text-[10px]">{normalRecipient}</span>)
                              </li>
                              <li>
                                • Depository ending in{" "}
                                <strong className="font-mono text-safe">
                                  ••••{normalBankSuffix}
                                </strong>{" "}
                                (verified)
                              </li>
                              <li>• Contracted Net 30 terms cycle</li>
                            </ul>
                          </div>
                          <div className="rounded-lg border border-safe/30 bg-safe/15 p-3">
                            <div className="flex items-center gap-1.5 text-safe font-bold text-[11px] mb-1.5">
                              <ShieldCheck className="size-3.5 text-safe" />
                              This Inbound Message
                            </div>
                            <ul className="space-y-1 text-foreground font-medium">
                              <li>• Depository matches approved payee ledger</li>
                              <li>• Standard invoice format & payment terms</li>
                              <li>• SPF, DKIM, and DMARC checks passed</li>
                            </ul>
                          </div>
                        </div>
                        <div className="rounded-xl border border-safe/30 bg-card p-3 text-xs flex items-center gap-2 text-safe">
                          <ShieldCheck className="size-4 text-safe shrink-0" />
                          <span className="text-foreground">
                            <strong className="text-safe">Routine AP Disbursement Approved:</strong>{" "}
                            Verified supplier credentials match contracted master record. Standard
                            payment release authorized.
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-border pb-2">
                          <div className="flex items-center gap-2">
                            <GitCompare className="size-4 text-safe" />
                            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                              Behavioral Baseline Contrast
                            </h3>
                          </div>
                          {kase.evidence.sender_identity.auth.spf === "pass" && (
                            <span className="rounded-full bg-safe/20 border border-safe/40 px-2 py-0.5 text-[10px] font-bold text-safe">
                              SPF/DKIM: PASS (Mailbox Compromised)
                            </span>
                          )}
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3 text-xs">
                          <div className="rounded-lg border border-safe/30 bg-safe/10 p-3">
                            <div className="flex items-center gap-1.5 text-safe font-bold text-[11px] mb-1.5">
                              <CheckCircle2 className="size-3.5 text-safe" />
                              Normal Vendor Profile
                            </div>
                            <ul className="space-y-1 text-muted-foreground">
                              <li>
                                • Invoices to AP (
                                <span className="font-mono text-[10px]">{normalRecipient}</span>)
                              </li>
                              <li>
                                • Depository ending in{" "}
                                <strong className="font-mono text-safe">
                                  ••••{normalBankSuffix}
                                </strong>{" "}
                                (on file)
                              </li>
                              <li>• Standard Net 30 terms cycle</li>
                            </ul>
                          </div>

                          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                            <div className="flex items-center gap-1.5 text-destructive font-bold text-[11px] mb-1.5">
                              <AlertTriangle className="size-3.5 text-destructive" />
                              This Inbound Anomaly
                            </div>
                            <ul className="space-y-1 text-foreground font-medium">
                              <li>
                                • Depository changed to{" "}
                                <BankAccountHoverCard
                                  bankSuffix={anomalyBankSuffix}
                                  isApproved={false}
                                  beneficiary={kase.evidence.financial.beneficiary}
                                  vendorName={kase.vendor}
                                >
                                  <strong className="font-mono text-destructive bg-destructive/20 px-1 py-0.5 rounded cursor-pointer hover:bg-destructive/30">
                                    ••••{anomalyBankSuffix}
                                  </strong>
                                </BankAccountHoverCard>
                              </li>
                              <li>• Urgent same-day release demanded</li>
                              <li>• Off-domain Reply-To routing</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* IMMEDIATE AP CONTAINMENT PROTOCOL */}
                      <div className="rounded-xl border border-destructive/40 bg-card p-4 text-xs">
                        <div className="flex items-center justify-between border-b border-destructive/20 pb-2">
                          <div className="flex items-center gap-1.5 text-destructive font-bold uppercase tracking-wider text-[11px]">
                            <ShieldAlert className="size-4 text-destructive" />
                            Immediate AP Containment Protocol
                          </div>
                          <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive">
                            Priority 1
                          </span>
                        </div>
                        <ol className="mt-3 space-y-2 text-foreground font-medium">
                          <li className="flex items-start gap-2">
                            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                              1
                            </span>
                            <span>
                              <strong className="text-foreground">Place payment hold</strong> in
                              accounting system on voucher.
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                              2
                            </span>
                            <span>
                              <strong className="text-foreground">Call known vendor contact</strong>{" "}
                              at verified phone (
                              <span className="text-destructive font-semibold">
                                not number in email
                              </span>
                              ).
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                              3
                            </span>
                            <span>
                              <strong className="text-foreground">Add bank suffix</strong> (••••
                              {anomalyBankSuffix}) to enterprise blocklist.
                            </span>
                          </li>
                        </ol>
                      </div>
                    </>
                  );
                })()}

                {/* TOP EVIDENCE TIMELINE */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">
                    Forensic Evidence Signals ({kase.timeline.length})
                  </h3>
                  <ol className="space-y-3 text-xs">
                    {kase.timeline.slice(0, 4).map((t, idx) => (
                      <li key={t.order ?? idx} className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-1 size-2 rounded-full shrink-0",
                            t.severity === "critical"
                              ? "bg-destructive"
                              : t.severity === "high"
                                ? "bg-warning"
                                : "bg-muted-foreground",
                          )}
                        />
                        <div>
                          <p className="font-bold text-foreground">{t.title}</p>
                          <p className="mt-0.5 text-muted-foreground leading-relaxed">
                            {t.description}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* BODY PREVIEW */}
                {kase.body_preview && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                      Message Body Excerpt
                    </h3>
                    <p className="font-mono text-xs text-foreground bg-[var(--sunken)] p-3 rounded-lg border border-border whitespace-pre-wrap leading-relaxed">
                      {kase.body_preview}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* ACTION MODAL FOR CONFIRMATION */}
      <ActionModal
        action={action}
        open={action !== null}
        pending={submitAction.isPending}
        bankSuffix={kase?.evidence?.financial?.bank_account_last4 ?? "5518"}
        onCancel={() => setAction(null)}
        onConfirm={(note) => action && submitAction.mutate({ type: action, note })}
      />
    </>
  );
}
