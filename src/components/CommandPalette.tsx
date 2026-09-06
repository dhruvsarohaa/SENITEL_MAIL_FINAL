import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CornerDownLeft,
  FileSearch,
  FileUp,
  Network,
  Settings,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { RiskBadge } from "@/components/RiskBadge";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const casesQuery = useQuery({ queryKey: ["cases"], queryFn: api.listCases });
  const cases = casesQuery.data?.data ?? [];

  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    callback();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a case ID, vendor, action, or command..." />
      <CommandList className="max-h-[380px] p-2">
        <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
          No matching cases, suppliers, or commands found.
        </CommandEmpty>

        {/* RECENT INVESTIGATIONS & ACTIVE THREATS */}
        <CommandGroup heading="Recent Investigations (BEC Cases)">
          {cases.slice(0, 5).map((c) => (
            <CommandItem
              key={c.id}
              value={`${c.case_number} ${c.vendor ?? ""} ${c.subject} ${c.sender}`}
              onSelect={() =>
                handleSelect(() => navigate({ to: "/cases/$caseId", params: { caseId: c.id } }))
              }
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl cursor-pointer hover:bg-muted/60"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                  <ShieldAlert className="size-3.5 text-primary" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-foreground">
                      {c.case_number}
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                      {c.vendor || "External Threat"}
                    </span>
                    {c.amount_at_risk && (
                      <span className="text-[11px] font-mono font-medium text-muted-foreground">
                        {formatCurrency(c.amount_at_risk, c.currency ?? "USD")}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate max-w-[340px]">
                    {c.subject}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RiskBadge severity={c.severity} score={c.risk_score} />
                <CornerDownLeft className="size-3 text-muted-foreground" />
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator className="my-1.5" />

        {/* QUICK NAVIGATION & CHANNELS */}
        <CommandGroup heading="Platform Navigation">
          <CommandItem
            value="analyze email investigate eml upload"
            onSelect={() => handleSelect(() => navigate({ to: "/analyze" }))}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-muted/60"
          >
            <FileUp className="size-4 text-blue-500" />
            <span className="text-xs font-semibold text-foreground">
              Analyze Inbound Email / RFC822 EML
            </span>
            <CommandShortcut className="text-[10px] font-mono">G A</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="cases investigations queue all"
            onSelect={() => handleSelect(() => navigate({ to: "/cases" }))}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-muted/60"
          >
            <FileSearch className="size-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">All Investigations Queue</span>
            <CommandShortcut className="text-[10px] font-mono">G C</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="campaigns correlation clusters coordinated"
            onSelect={() => handleSelect(() => navigate({ to: "/campaigns" }))}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-muted/60"
          >
            <Network className="size-4 text-purple-500" />
            <span className="text-xs font-semibold text-foreground">
              Campaign Correlation Clusters
            </span>
            <CommandShortcut className="text-[10px] font-mono">G M</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="vendors profiles directory suppliers baseline"
            onSelect={() => handleSelect(() => navigate({ to: "/vendors" }))}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-muted/60"
          >
            <Building2 className="size-4 text-emerald-500" />
            <span className="text-xs font-semibold text-foreground">
              Trusted Vendor Remittance Directory
            </span>
            <CommandShortcut className="text-[10px] font-mono">G V</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="settings configuration telemetry gateway"
            onSelect={() => handleSelect(() => navigate({ to: "/settings" }))}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-muted/60"
          >
            <Settings className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">
              Security & Gateway Settings
            </span>
            <CommandShortcut className="text-[10px] font-mono">G S</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator className="my-1.5" />

        {/* DEMO LAB SCENARIOS */}
        <CommandGroup heading="Lead Attack Scenarios (1-Click Test Lab)">
          <CommandItem
            value="case 2 harborline metals compromised genuine account pass"
            onSelect={() => handleSelect(() => navigate({ to: "/analyze" }))}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-muted/60"
          >
            <Sparkles className="size-4 text-amber-500" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-foreground block">
                Case 2: Compromised Genuine Account (Harborline Metals)
              </span>
              <span className="text-[10px] text-muted-foreground block truncate">
                SPF/DKIM: PASS · Intercepted bank diversion to ••••5518
              </span>
            </div>
            <span className="rounded bg-destructive/15 text-destructive border border-destructive/30 text-[10px] font-bold px-1.5 py-0.5">
              Lead Demo
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
