import { useState, useId } from "react";
import { ShieldCheck, AlertTriangle, Sparkles, BrainCircuit } from "lucide-react";
import type { Case } from "@/types/sentinel";
import { cn } from "@/lib/utils";

interface VectorSlice {
  id: string;
  label: string;
  pct: number;
  color: string;
  glowColor: string;
  source: string;
  detail: string;
}

export function ThreatVectorDonut({ kase }: { kase: Case }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const filterId = useId();

  const isBenign = kase.threat_class === "benign" || kase.risk_score < 35;

  // Derive contextual slices based on threat class
  const slices: VectorSlice[] = isBenign
    ? [
        {
          id: "domain",
          label: "Authentic Supplier Domain",
          pct: 40,
          color: "#10b981",
          glowColor: "rgba(16, 185, 129, 0.4)",
          source: "Gateway SPF/DKIM",
          detail: "From and Return-Path align with registered supplier domain",
        },
        {
          id: "bank",
          label: "Approved Depository",
          pct: 30,
          color: "#22c55e",
          glowColor: "rgba(34, 197, 94, 0.4)",
          source: "ERP Master File",
          detail: `Account ending ••••${kase.evidence.financial.bank_account_last4 || "1142"} verified on record`,
        },
        {
          id: "terms",
          label: "Routine Remittance Schedule",
          pct: 20,
          color: "#14b8a6",
          glowColor: "rgba(20, 184, 166, 0.4)",
          source: "Historical Pattern",
          detail: "Net-30 payment term without coercive urgency or pressure",
        },
        {
          id: "channel",
          label: "Known AP Contact Channel",
          pct: 10,
          color: "#06b6d4",
          glowColor: "rgba(6, 182, 212, 0.4)",
          source: "Baseline Profile",
          detail: "Known sender mailbox matching historical correspondence",
        },
      ]
    : kase.threat_class === "invoice_fraud"
      ? [
          {
            id: "urgency",
            label: "Linguistic Urgency & Pressure",
            pct: 35,
            color: "#f97316",
            glowColor: "rgba(249, 115, 22, 0.45)",
            source: "Google Gemini 3.6 Flash",
            detail: "Demands immediate same-day wire transfer to avoid penalty",
          },
          {
            id: "bank",
            label: "Unapproved Depository Divert",
            pct: 28,
            color: "#ef4444",
            glowColor: "rgba(239, 68, 68, 0.45)",
            source: "Vendor Baseline Engine",
            detail: `Account ending ••••${kase.evidence.financial.bank_account_last4 || "7741"} not in supplier records`,
          },
          {
            id: "domain",
            label: "Look-Alike Billing Domain",
            pct: 22,
            color: "#06b6d4",
            glowColor: "rgba(6, 182, 212, 0.4)",
            source: "RFC822 Header Audit",
            detail: "Off-domain look-alike registered recently or domain mismatch",
          },
          {
            id: "routing",
            label: "Off-Domain Reply-To Routing",
            pct: 15,
            color: "#a855f7",
            glowColor: "rgba(168, 85, 247, 0.4)",
            source: "Gateway Interception",
            detail: "Replies silently routed away from verified vendor mailservers",
          },
        ]
      : kase.threat_class === "ceo_impersonation"
        ? [
            {
              id: "authority",
              label: "Executive Impersonation",
              pct: 40,
              color: "#ef4444",
              glowColor: "rgba(239, 68, 68, 0.45)",
              source: "Google Gemini 3.6 Flash",
              detail: "Displays CEO/Executive name with off-domain mailbox",
            },
            {
              id: "secrecy",
              label: "Confidentiality Mandate",
              pct: 25,
              color: "#f97316",
              glowColor: "rgba(249, 115, 22, 0.4)",
              source: "Linguistic Analyzer",
              detail: "Demands secrecy regarding M&A or urgent wire release",
            },
            {
              id: "bypass",
              label: "AP Policy Bypass Attempt",
              pct: 20,
              color: "#06b6d4",
              glowColor: "rgba(6, 182, 212, 0.4)",
              source: "Behavioral Contrast",
              detail: "Requests bypassing secondary approvals before close of business",
            },
            {
              id: "routing",
              label: "Off-Domain Transit Relay",
              pct: 15,
              color: "#a855f7",
              glowColor: "rgba(168, 85, 247, 0.4)",
              source: "Relay Path Forensics",
              detail: "Inbound via external cloud proxy rather than enterprise tenant",
            },
          ]
        : [
            {
              id: "lure",
              label: "Credential Harvesting Lure",
              pct: 42,
              color: "#ef4444",
              glowColor: "rgba(239, 68, 68, 0.45)",
              source: "Gemini / Regex L1",
              detail: "Fake Microsoft 365 or Okta authentication portal link",
            },
            {
              id: "quota",
              label: "Session Expiration Pretext",
              pct: 28,
              color: "#f97316",
              glowColor: "rgba(249, 115, 22, 0.4)",
              source: "Intent Classifier",
              detail: "Fabricated mailbox storage or password expiration warning",
            },
            {
              id: "gateway",
              label: "SPF/DKIM Spoofing",
              pct: 18,
              color: "#06b6d4",
              glowColor: "rgba(6, 182, 212, 0.4)",
              source: "Authentication Headers",
              detail: "Inbound gateway softfail or misaligned return-path",
            },
            {
              id: "payload",
              label: "Malicious Attachment Artifact",
              pct: 12,
              color: "#a855f7",
              glowColor: "rgba(168, 85, 247, 0.4)",
              source: "MIME Inspector",
              detail: "Suspicious macro or deceptive HTML document payload",
            },
          ];

  // SVG Donut calculation
  const size = 180;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate cumulative stroke dasharrays
  let accumulatedPercent = 0;
  const renderedSlices = slices.map((slice) => {
    const strokeDasharray = `${(slice.pct / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += slice.pct;
    return { ...slice, strokeDasharray, strokeDashoffset };
  });

  const activeSlice = slices.find((s) => s.id === hoveredId) || null;

  return (
    <div className="flex flex-col md:flex-row items-center gap-6 p-4 rounded-xl border border-border bg-card/60 backdrop-blur-md">
      {/* SVG Donut */}
      <div className="relative shrink-0 flex items-center justify-center size-[180px]">
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          style={{ overflow: "visible" }}
        >
          <defs>
            <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-border/60 dark:text-muted/30"
          />

          {/* Segmented Slices */}
          {renderedSlices.map((s) => {
            const isHovered = hoveredId === s.id;
            return (
              <circle
                key={s.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={s.strokeDasharray}
                strokeDashoffset={s.strokeDashoffset}
                strokeLinecap="round"
                className="cursor-pointer transition-all duration-300"
                style={{
                  filter: isHovered ? `drop-shadow(0 0 6px ${s.glowColor})` : undefined,
                }}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            );
          })}
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {activeSlice ? (
            <div className="animate-in fade-in zoom-in-90 duration-150">
              <span className="font-mono text-xl font-bold text-foreground">
                {activeSlice.pct}%
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Weight
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {isBenign ? (
                <ShieldCheck className="size-6 text-emerald-500 animate-pulse" />
              ) : (
                <BrainCircuit className="size-6 text-cyan-500 animate-pulse" />
              )}
              <span className="mt-1 font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                {isBenign ? "Verified" : "Signals"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Legend Pills */}
      <div className="flex-1 w-full space-y-2">
        <div className="flex items-center justify-between pb-1 border-b border-border">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
            {isBenign ? "✦ Baseline Confidence Weights" : "✦ Multi-Vector Attack Breakdown"}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {isBenign ? "100% Benign" : `${kase.risk_score}/100 Risk`}
          </span>
        </div>

        <div className="grid gap-1.5 sm:grid-cols-2">
          {slices.map((s) => {
            const isHovered = hoveredId === s.id;
            return (
              <div
                key={s.id}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg border transition-all duration-200 cursor-pointer text-left",
                  isHovered
                    ? "border-primary/50 bg-card shadow-sm translate-x-0.5"
                    : "border-border bg-card/40 hover:bg-card/80",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.glowColor}` }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">{s.label}</p>
                    <p className="truncate text-[10px] text-muted-foreground font-mono">
                      {s.source}
                    </p>
                  </div>
                </div>
                <span className="ml-2 font-mono text-xs font-bold text-foreground shrink-0">
                  {s.pct}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Dynamic Detail Callout on Hover */}
        {activeSlice && (
          <div className="mt-2 p-2.5 rounded-lg bg-card border border-border text-xs text-muted-foreground animate-in fade-in-50 duration-150 shadow-2xs">
            <span className="font-semibold text-foreground">{activeSlice.label}:</span>{" "}
            {activeSlice.detail}
          </div>
        )}
      </div>
    </div>
  );
}
