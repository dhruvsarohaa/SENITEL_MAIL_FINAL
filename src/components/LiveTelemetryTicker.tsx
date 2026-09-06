import { useState, useEffect } from "react";
import { Activity, ShieldCheck, Sparkles, Database, Lock, AlertTriangle, X } from "lucide-react";

interface TelemetryItem {
  id: string;
  icon: typeof Activity;
  badge: string;
  text: string;
  tone: "rose" | "cyan" | "emerald" | "amber";
}

const ITEMS: TelemetryItem[] = [
  {
    id: "1",
    icon: ShieldCheck,
    badge: "AUTONOMOUS",
    text: "P0 Intercepted: $184,320 wire diversion frozen",
    tone: "rose",
  },
  {
    id: "2",
    icon: Sparkles,
    badge: "GEMINI 3.6",
    text: "Deception Score: 98.4% — high confidence urgency extraction",
    tone: "cyan",
  },
  {
    id: "3",
    icon: Database,
    badge: "ATLAS DB",
    text: "Cluster connected: 14ms latency",
    tone: "emerald",
  },
  {
    id: "4",
    icon: Lock,
    badge: "AUDIT",
    text: "43 suppliers baselined · 100% coverage",
    tone: "emerald",
  },
  {
    id: "5",
    icon: AlertTriangle,
    badge: "CAMPAIGN",
    text: "Cluster CMP-401 targeting Finance across 3 mailboxes",
    tone: "amber",
  },
];

const STORAGE_KEY = "sentinel-ticker-dismissed";

export function LiveTelemetryTicker() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  if (dismissed) return null;

  // Duplicate array for seamless infinite marquee scroll
  const marqueeItems = [...ITEMS, ...ITEMS];

  return (
    <div className="relative w-full overflow-hidden border-b border-border/40 bg-card/60 backdrop-blur-md text-muted-foreground py-1 select-none">
      {/* Edge gradient masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-card to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-8 z-10 w-12 bg-gradient-to-l from-card to-transparent" />

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-1 top-1/2 -translate-y-1/2 z-20 rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        title="Dismiss ticker"
      >
        <X className="size-3" />
      </button>

      <div className="flex w-max animate-ticker items-center gap-6 hover:[animation-play-state:paused]">
        {marqueeItems.map((item, idx) => {
          return (
            <div key={`${item.id}-${idx}`} className="flex items-center gap-1.5 text-[11px]">
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold tracking-wide border ${
                  item.tone === "rose"
                    ? "bg-destructive/15 text-destructive border-destructive/20"
                    : item.tone === "cyan"
                      ? "bg-primary/15 text-primary border-primary/20"
                      : item.tone === "amber"
                        ? "bg-warning/15 text-warning border-warning/20"
                        : "bg-safe/15 text-safe border-safe/20"
                }`}
              >
                {item.badge}
              </span>
              <span className="text-muted-foreground font-medium">{item.text}</span>
              <span className="text-border font-mono text-[10px] mx-1">·</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
