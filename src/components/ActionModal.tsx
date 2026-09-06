import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import type { AnalystActionType } from "@/types/sentinel";

export const actionMeta: Record<
  AnalystActionType,
  {
    label: string;
    title: string;
    description: string;
    tone: "safe" | "critical" | "warning" | "primary";
  }
> = {
  mark_safe: {
    label: "Mark Safe",
    title: "Mark this case as safe?",
    description: "The case will be closed as benign and removed from the high-priority queue.",
    tone: "safe",
  },
  hold_payment: {
    label: "Hold Payment",
    title: "Place a payment hold?",
    description:
      "Finance will be notified immediately to stop any transfer linked to this invoice or voucher.",
    tone: "warning",
  },
  escalate: {
    label: "Escalate to Security",
    title: "Escalate to the security team?",
    description:
      "The case and all forensic evidence will be handed to security for emergency response.",
    tone: "primary",
  },
  confirm_threat: {
    label: "Confirm Threat",
    title: "Confirm this email as a threat?",
    description:
      "The case is recorded as a confirmed attack and its indicators are marked malicious.",
    tone: "critical",
  },
};

const toneClasses: Record<string, string> = {
  safe: "bg-safe text-background hover:bg-safe/90",
  critical: "bg-critical text-primary-foreground hover:bg-critical/90",
  warning: "bg-warning text-background hover:bg-warning/90",
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
};

export function ActionModal({
  action,
  open,
  pending,
  bankSuffix,
  onCancel,
  onConfirm,
}: {
  action: AnalystActionType | null;
  open: boolean;
  pending?: boolean;
  bankSuffix?: string | undefined;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [includeProtocol, setIncludeProtocol] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setIncludeProtocol(true);
    }
  }, [open, action]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !action) return null;
  const meta = actionMeta[action];
  const isFinanceHold =
    action === "hold_payment" || action === "confirm_threat" || action === "escalate";

  const handleConfirm = () => {
    let finalNote = note.trim();
    if (isFinanceHold && includeProtocol) {
      const protocolNote = `[CONTAINMENT PROTOCOL]: 1. ERP payment hold placed on voucher. 2. Out-of-band vendor telephone callback initiated (verified directory number). 3. Depository suffix ${bankSuffix ? `••••${bankSuffix}` : "••••5518"} added to enterprise blocklist.`;
      finalNote = finalNote ? `${finalNote}\n\n${protocolNote}` : protocolNote;
    }
    onConfirm(finalNote);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-modal-title"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div ref={ref} className="panel-raised w-full max-w-lg p-6 shadow-2xl border border-border">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-warning/15 text-warning shadow-2xs">
              <AlertTriangle className="size-4 text-warning" aria-hidden />
            </span>
            <div>
              <h2 id="action-modal-title" className="text-base font-bold text-foreground">
                {meta.title}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* AP CONTAINMENT PROTOCOL CHECKLIST */}
        {isFinanceHold && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs">
            <div className="flex items-center justify-between border-b border-destructive/20 pb-2">
              <div className="flex items-center gap-1.5 text-destructive font-bold uppercase tracking-wider text-[11px]">
                <ShieldAlert className="size-4 text-destructive" />
                Actionable Finance Containment Steps (AP Team)
              </div>
              <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive">
                Required
              </span>
            </div>
            <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
              Explicit instructions for Accounts Payable and Treasury before releasing funds:
            </p>
            <ol className="mt-2.5 space-y-2 text-foreground font-medium">
              <li className="flex items-start gap-2">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                  1
                </span>
                <div>
                  <strong className="text-foreground">Place payment hold</strong> in accounting
                  system on voucher.
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                  2
                </span>
                <div>
                  <strong className="text-foreground">Call known vendor contact</strong> at verified
                  telephone number (
                  <span className="text-destructive font-bold">not the number in the email</span>).
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                  3
                </span>
                <div>
                  <strong className="text-foreground">Add bank suffix</strong>{" "}
                  {bankSuffix ? (
                    <code className="font-mono bg-card px-1.5 py-0.5 rounded border border-destructive/30 text-destructive font-bold">
                      ••••{bankSuffix}
                    </code>
                  ) : (
                    "••••5518"
                  )}{" "}
                  to enterprise blocklist across banking rails.
                </div>
              </li>
            </ol>

            <label className="mt-3 flex items-center gap-2 pt-2 border-t border-destructive/20 cursor-pointer text-[11px] font-semibold text-destructive">
              <input
                type="checkbox"
                checked={includeProtocol}
                onChange={(e) => setIncludeProtocol(e.target.checked)}
                className="size-3.5 rounded border-destructive/40 text-destructive focus:ring-destructive"
              />
              Record containment protocol execution in audit ledger
            </label>
          </div>
        )}

        <label
          htmlFor="action-note"
          className="mt-4 mb-1.5 block text-xs font-semibold text-foreground"
        >
          Analyst Resolution Note
        </label>
        <textarea
          id="action-note"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Document findings, authorization references, or internal escalation ticket..."
        />

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={pending}
            className={`rounded-xl px-4 py-2 text-xs font-bold shadow-xs disabled:opacity-60 cursor-pointer ${toneClasses[meta.tone]}`}
          >
            {pending ? "Recording Action…" : meta.label}
          </button>
        </div>
      </div>
    </div>
  );
}
