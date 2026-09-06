import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EvidenceCard({
  title,
  letter,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  letter?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel flex flex-col p-5", className)} aria-label={title}>
      <header className="mb-4 flex items-center gap-2.5">
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <h3 className="text-sm font-semibold text-foreground">
          {letter && <span className="mr-1.5 text-muted-foreground">{letter}.</span>}
          {title}
        </h3>
      </header>
      <div className="flex-1 space-y-3 text-sm">{children}</div>
    </section>
  );
}

export function EvidenceRow({
  label,
  value,
  tone = "default",
  mono,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "critical" | "warning" | "safe";
  mono?: boolean;
}) {
  const toneClass =
    tone === "critical"
      ? "text-critical"
      : tone === "warning"
        ? "text-warning"
        : tone === "safe"
          ? "text-safe"
          : "text-foreground";
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-right text-sm break-all", toneClass, mono && "font-mono text-xs")}>
        {value}
      </span>
    </div>
  );
}
