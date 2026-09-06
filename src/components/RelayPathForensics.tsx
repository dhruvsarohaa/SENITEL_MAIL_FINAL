import { useState, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Lock,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import type { Case, RelayHop } from "@/types/sentinel";
import { cn } from "@/lib/utils";

interface RelayPathForensicsProps {
  kase: Case;
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸",
  NL: "🇳🇱",
  DE: "🇩🇪",
  GB: "🇬🇧",
  FR: "🇫🇷",
  CA: "🇨🇦",
  AU: "🇦🇺",
  JP: "🇯🇵",
  SG: "🇸🇬",
  CH: "🇨🇭",
  RU: "🇷🇺",
  CN: "🇨🇳",
};

function safeUtcString(timestamp?: string): string {
  if (!timestamp) return new Date().toUTCString();
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

interface HopWithMetrics extends RelayHop {
  latencyMs?: number;
  formattedLatency?: string;
  isAnomalyDelay?: boolean;
}

export function RelayPathForensics({ kase }: RelayPathForensicsProps) {
  const [expandedHop, setExpandedHop] = useState<number | null>(null);
  const [copiedHopIndex, setCopiedHopIndex] = useState<number | null>(null);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  // Compute inter-hop latencies based on hop timestamps
  const hopsWithMetrics: HopWithMetrics[] = useMemo(() => {
    const rawHops = kase.relay_path;
    return rawHops.map((hop, idx) => {
      if (idx === 0) {
        return { ...hop, latencyMs: 0, formattedLatency: "Origin" };
      }
      const prev = rawHops[idx - 1];
      if (hop.timestamp && prev?.timestamp) {
        const tPrev = new Date(prev.timestamp).getTime();
        const tCurr = new Date(hop.timestamp).getTime();
        if (!Number.isNaN(tPrev) && !Number.isNaN(tCurr)) {
          const deltaMs = Math.max(0, tCurr - tPrev);
          const formatted =
            deltaMs >= 60_000
              ? `+${Math.round(deltaMs / 60_000)}m ${Math.round(deltaMs / 1000) % 60}s`
              : deltaMs >= 1000
                ? `+${(deltaMs / 1000).toFixed(1)}s`
                : `+${deltaMs}ms`;
          const isAnomaly = deltaMs > 5000 || Boolean(hop.suspicious);
          return {
            ...hop,
            latencyMs: deltaMs,
            formattedLatency: formatted,
            isAnomalyDelay: isAnomaly,
          };
        }
      }
      // Fallback deterministic simulation based on hop metadata
      const simulatedDelta = hop.suspicious ? 3120 : idx === rawHops.length - 1 ? 48 : 420;
      return {
        ...hop,
        latencyMs: simulatedDelta,
        formattedLatency:
          simulatedDelta >= 1000
            ? `+${(simulatedDelta / 1000).toFixed(1)}s`
            : `+${simulatedDelta}ms`,
        isAnomalyDelay: Boolean(hop.suspicious),
      };
    });
  }, [kase.relay_path]);

  const suspiciousCount = hopsWithMetrics.filter((h) => h.suspicious).length;
  const originHop = hopsWithMetrics[0];
  const perimeterHop = hopsWithMetrics[hopsWithMetrics.length - 1];

  function copyIpAddress(ip: string, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    toast.success(`Copied IP ${ip} to clipboard`);
    setTimeout(() => setCopiedIp(null), 1800);
  }

  function copyRawHeader(hop: RelayHop, e: React.MouseEvent) {
    e.stopPropagation();
    const raw = `Received: from ${hop.host} (${hop.host} [${hop.ip}])
    by mail.astermanufacturing.com with ESMTPS (TLS1.3)
    id ${Math.random().toString(36).substring(2, 10).toUpperCase()}
    for <ap@astermanufacturing.com>;
    ${safeUtcString(hop.timestamp)}`;
    navigator.clipboard.writeText(raw);
    setCopiedHopIndex(hop.index);
    toast.success(`Copied RFC822 Received header for Hop #${hop.index}`);
    setTimeout(() => setCopiedHopIndex(null), 1800);
  }

  return (
    <section className="panel h-full flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className="border-b border-border bg-muted/40 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-2xs">
              <Server className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Relay Path & Network Telemetry Forensics
              </h2>
              <p className="text-xs text-muted-foreground">
                MIME Received headers decompiled in chronological transmission order.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {suspiciousCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-bold text-destructive">
                <ShieldAlert className="size-3 text-destructive" />
                {suspiciousCount} Suspicious {suspiciousCount === 1 ? "Hop" : "Hops"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-safe/30 bg-safe/10 px-2.5 py-0.5 text-[11px] font-bold text-safe">
                <ShieldCheck className="size-3 text-safe" />
                Clean Route
              </span>
            )}
            <span className="rounded-md border border-border bg-card px-2 py-0.5 text-xs font-mono font-semibold text-muted-foreground">
              {hopsWithMetrics.length} Hops Total
            </span>
          </div>
        </div>

        {/* TELEMETRY SPARKLINE STRIP */}
        <div className="mt-4 rounded-xl border border-border bg-card p-3 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-2 border-b border-border">
            <span className="flex items-center gap-1 font-semibold text-foreground uppercase tracking-wider text-[10px]">
              <Activity className="size-3 text-primary" />
              Hop-by-Hop Transmission Pipeline
            </span>
            <span className="font-mono text-[10px] font-medium text-muted-foreground">
              {originHop?.country
                ? `${COUNTRY_FLAGS[originHop.country] || "🌐"} ${originHop.country}`
                : "Origin"}{" "}
              →{" "}
              {perimeterHop?.country
                ? `${COUNTRY_FLAGS[perimeterHop.country] || "🏢"} Enterprise Gateway`
                : "Internal"}
            </span>
          </div>

          {/* LATENCY PIPELINE NODES */}
          <div className="mt-3 flex items-center justify-between gap-1 overflow-x-auto pb-1">
            {hopsWithMetrics.map((hop, i) => (
              <div
                key={`spark-${hop.index}`}
                className="flex items-center flex-1 min-w-[90px] last:flex-none"
              >
                {/* NODE */}
                <button
                  type="button"
                  onClick={() => setExpandedHop(expandedHop === hop.index ? null : hop.index)}
                  className={cn(
                    "flex flex-col items-center text-center p-1.5 rounded-lg border transition-all cursor-pointer",
                    hop.suspicious
                      ? "border-destructive/40 bg-destructive/10 hover:bg-destructive/20"
                      : "border-border bg-secondary/50 hover:bg-secondary",
                    expandedHop === hop.index && "ring-2 ring-primary",
                  )}
                >
                  <span
                    className={cn(
                      "size-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold text-white shadow-2xs",
                      hop.suspicious
                        ? "bg-destructive"
                        : i === hopsWithMetrics.length - 1
                          ? "bg-safe"
                          : "bg-muted-foreground",
                    )}
                  >
                    {hop.index}
                  </span>
                  <span className="mt-1 text-[10px] font-mono font-bold text-foreground truncate max-w-[70px]">
                    {hop.country
                      ? `${COUNTRY_FLAGS[hop.country] || ""} ${hop.country}`
                      : `Hop ${hop.index}`}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-mono font-semibold",
                      hop.isAnomalyDelay ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {hop.formattedLatency}
                  </span>
                </button>

                {/* CONNECTOR ARROW */}
                {i < hopsWithMetrics.length - 1 && (
                  <div className="flex-1 flex items-center justify-center px-1">
                    <div
                      className={cn(
                        "h-0.5 w-full",
                        hopsWithMetrics[i + 1]?.suspicious ? "bg-destructive/40" : "bg-border",
                      )}
                    />
                    <ArrowRight
                      className={cn(
                        "size-3 shrink-0 -ml-1",
                        hopsWithMetrics[i + 1]?.suspicious
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* HOP LIST */}
      <ol className="p-5 space-y-3 flex-1 overflow-y-auto">
        {hopsWithMetrics.map((hop, i) => {
          const isExpanded = expandedHop === hop.index;
          return (
            <li key={`${hop.index}-${hop.ip}`} className="flex gap-3.5">
              {/* VERTICAL TIMELINE RAIL */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "mt-1 flex size-7 items-center justify-center rounded-full border font-mono text-xs font-bold transition-all shadow-2xs",
                    hop.suspicious
                      ? "border-destructive/40 bg-destructive text-destructive-foreground"
                      : i === hopsWithMetrics.length - 1
                        ? "border-safe/40 bg-safe text-safe-foreground"
                        : "border-border bg-secondary text-foreground",
                  )}
                >
                  {hop.index}
                </span>
                {i < hopsWithMetrics.length - 1 && (
                  <span
                    className={cn(
                      "w-0.5 flex-1 my-1",
                      hopsWithMetrics[i + 1]?.suspicious ? "bg-destructive/40" : "bg-border",
                    )}
                    aria-hidden
                  />
                )}
              </div>

              {/* HOP DOSSIER CARD */}
              <div
                className={cn(
                  "mb-1 min-w-0 flex-1 rounded-2xl border transition-all text-xs",
                  hop.suspicious
                    ? "border-destructive/30 bg-destructive/10 shadow-xs"
                    : i === hopsWithMetrics.length - 1
                      ? "border-safe/30 bg-safe/10 shadow-2xs"
                      : "border-border bg-card shadow-2xs",
                )}
              >
                {/* CARD TOP ROW */}
                <div className="p-3.5 pb-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base leading-none">
                          {hop.country ? COUNTRY_FLAGS[hop.country] || "🌐" : "🌐"}
                        </span>
                        <p
                          className={cn(
                            "truncate font-mono text-xs font-bold",
                            hop.suspicious ? "text-destructive" : "text-foreground",
                          )}
                        >
                          {hop.host}
                        </p>
                      </div>

                      {hop.timestamp && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="size-3 text-muted-foreground" />
                          {formatDateTime(hop.timestamp)}
                        </p>
                      )}
                    </div>

                    {/* STATUS PILL & LATENCY DELTA */}
                    <div className="flex flex-col items-end gap-1">
                      {hop.suspicious ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive uppercase tracking-wider">
                          <AlertTriangle className="size-2.5 text-destructive" />
                          Proxy / Untrusted Relay
                        </span>
                      ) : i === hopsWithMetrics.length - 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-safe/30 bg-safe/15 px-2 py-0.5 text-[10px] font-bold text-safe uppercase tracking-wider">
                          <Lock className="size-2.5 text-safe" />
                          Enterprise Ingress
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          External Transit
                        </span>
                      )}

                      <span
                        className={cn(
                          "font-mono text-[10px] font-bold px-1.5 py-0.5 rounded",
                          hop.isAnomalyDelay
                            ? "text-destructive bg-destructive/15 border border-destructive/25"
                            : "text-muted-foreground bg-muted",
                        )}
                      >
                        Transit: {hop.formattedLatency}
                      </span>
                    </div>
                  </div>

                  {/* TELEMETRY CHIPS */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-border">
                    {/* IP BADGE WITH COPY */}
                    <button
                      type="button"
                      onClick={(e) => copyIpAddress(hop.ip, e)}
                      title="Click to copy IP"
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary hover:bg-secondary/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground shadow-2xs transition-colors cursor-pointer"
                    >
                      <span>{hop.ip}</span>
                      {copiedIp === hop.ip ? (
                        <Check className="size-3 text-safe" />
                      ) : (
                        <Copy className="size-2.5 text-muted-foreground hover:text-foreground" />
                      )}
                    </button>

                    {/* ASN BADGE */}
                    {hop.asn && (
                      <span className="rounded-lg border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {hop.asn}
                      </span>
                    )}

                    {/* COUNTRY BADGE */}
                    {hop.country && (
                      <span className="rounded-lg border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground font-medium">
                        {COUNTRY_FLAGS[hop.country] || "🌐"} {hop.country}
                      </span>
                    )}

                    {/* EXPAND RAW RFC822 BUTTON */}
                    <button
                      type="button"
                      onClick={() => setExpandedHop(isExpanded ? null : hop.index)}
                      className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer"
                    >
                      <Terminal className="size-3" />
                      <span>{isExpanded ? "Hide RFC822" : "View RFC822"}</span>
                      {isExpanded ? (
                        <ChevronUp className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* EXPANDABLE RAW RFC822 RECEIVED HEADER INSPECTOR */}
                {isExpanded && (
                  <div className="border-t border-slate-200/80 bg-slate-950 p-3 text-[11px] font-mono text-emerald-400 rounded-b-2xl animate-in fade-in-0 duration-150">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 text-[10px]">
                      <span>RFC822 DECOMPILED HEADER · HOP #{hop.index}</span>
                      <button
                        type="button"
                        onClick={(e) => copyRawHeader(hop, e)}
                        className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        {copiedHopIndex === hop.index ? (
                          <>
                            <Check className="size-3 text-emerald-400" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>Copy Header</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap leading-relaxed select-all text-[10px]">
                      {`Received: from ${hop.host} (${hop.host} [${hop.ip}])
    by ${i === hopsWithMetrics.length - 1 ? "mail.astermanufacturing.com" : "relay.intermediate.mta"}
    with ESMTPS (TLS1.3 AES_256_GCM)
    for <ap@astermanufacturing.com>;
    ${safeUtcString(hop.timestamp)}`}
                    </pre>
                  </div>
                )}
              </div>
            </li>
          );
        })}

        {hopsWithMetrics.length === 0 && (
          <li className="py-12 text-center text-xs text-muted-foreground">
            No relay headers available for this message.
          </li>
        )}
      </ol>
    </section>
  );
}
