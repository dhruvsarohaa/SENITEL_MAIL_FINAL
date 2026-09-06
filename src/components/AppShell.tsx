import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  Building2,
  CheckCheck,
  ExternalLink,
  FileUp,
  FileSearch,
  Info,
  LayoutDashboard,
  Lock,
  LogIn,
  LogOut,
  Network,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { CustomCursor } from "@/components/CustomCursor";
import { AmbientOrbs } from "@/components/AmbientOrbs";
import { LiveTelemetryTicker } from "@/components/LiveTelemetryTicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SentinelLogoIcon } from "@/components/SentinelLogo";
import { DEMO_MODE } from "@/lib/api";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analyze", label: "Analyze Email", icon: FileUp },
  { to: "/cases", label: "Cases", icon: FileSearch },
  { to: "/campaigns", label: "Campaigns", icon: Network },
  { to: "/vendors", label: "Vendor Profiles", icon: Building2 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  children,
  breadcrumb = [],
}: {
  children: ReactNode;
  breadcrumb?: string[];
}) {
  const { user, isConfigured, signOut } = useAuth();
  const [openCmd, setOpenCmd] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpenCmd((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (isConfigured && !user) return <Navigate to="/sign-in" />;

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden">
      {/* Interactive Custom Magnetic Cursor with Lerp Smoothing */}
      <CustomCursor />

      {/* Perpetual Floating Ambient Glowing Orbs with Gentle Color Blend */}
      <AmbientOrbs />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] flex-col border-r border-sidebar-border bg-sidebar/80 px-4 py-5 lg:flex backdrop-blur-2xl">
        <Link to="/" className="mb-7 flex items-center gap-3 px-2 group">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-md transition-transform group-hover:scale-105 border border-slate-200/50">
            <SentinelLogoIcon size="100%" className="w-full h-full object-contain" />
            <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="block truncate text-[15.5px] font-extrabold tracking-tight text-foreground">
                Sentinel<span className="font-semibold text-foreground/80">Mail</span>
              </span>
              <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">
                LIVE
              </span>
            </span>
            <span className="block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Autonomous Defense
            </span>
          </span>
        </Link>

        <Link
          to="/analyze"
          className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary/15 via-primary/20 to-primary/15 hover:from-primary/25 hover:to-primary/20 px-3.5 py-2.5 text-xs font-semibold text-primary shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border border-primary/25 cursor-pointer"
        >
          <Sparkles className="size-4 text-primary animate-pulse" aria-hidden />
          Investigate Message
        </Link>

        <p className="mb-2 px-3 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Investigation Console
        </p>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              activeProps={{
                className:
                  "bg-primary/10 text-primary border-l-2 border-primary font-semibold shadow-xs",
              }}
              inactiveProps={{
                className:
                  "text-muted-foreground hover:bg-muted/40 hover:text-foreground border-l-2 border-transparent",
              }}
              className="relative flex items-center gap-2.5 rounded-r-xl px-3 py-2 text-xs font-medium transition-all duration-150"
            >
              <Icon className="size-[15px] shrink-0" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-2.5">
          <div className="rounded-xl border border-border bg-card/50 p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
                Mailbox Protection
              </span>
              <span className="font-mono text-[10px] text-emerald-400 font-bold">ACTIVE</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              M365 & Gmail connected. Continuous autonomous triage enabled.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-xs shadow-xs">
            <p className="font-semibold text-foreground">Sentinel Corporation</p>
            <p className="text-[10px] text-muted-foreground font-mono">Tenant: sentinel-corp</p>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col lg:pl-[250px]">
        <header className="sticky top-0 z-30 flex h-[64px] shrink-0 items-center justify-between gap-4 border-b border-border bg-background/60 px-5 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Header Brand Lockup */}
            <Link to="/" className="flex items-center gap-2 shrink-0 group lg:hidden mr-1">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-xs border border-slate-200/50 transition-transform group-hover:scale-105">
                <SentinelLogoIcon size="100%" className="w-full h-full object-contain" />
              </span>
              <span className="font-extrabold tracking-tight text-sm text-foreground">
                Sentinel<span className="font-semibold text-foreground/80">Mail</span>
              </span>
            </Link>

            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex min-w-0 items-center gap-1.5 text-xs">
                <li className="font-semibold text-muted-foreground hidden lg:flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white p-0.5 shadow-xs border border-slate-200/50">
                    <SentinelLogoIcon size="100%" className="w-full h-full object-contain" />
                  </span>
                  <span>SentinelMail</span>
                </li>
                {breadcrumb.map((crumb, i) => (
                  <li key={crumb + i} className="flex min-w-0 items-center gap-1.5">
                    <span className="text-border" aria-hidden>
                      /
                    </span>
                    <span
                      className={cn(
                        "truncate",
                        i === breadcrumb.length - 1
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {crumb}
                    </span>
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          {/* Global Quick Search Button (Cmd+K) */}
          <button
            type="button"
            onClick={() => setOpenCmd(true)}
            className="hidden sm:flex items-center gap-2 rounded-xl border border-border bg-input/50 px-3 py-1.5 text-xs text-muted-foreground hover:border-border hover:bg-input hover:text-foreground transition-all cursor-pointer shadow-sm"
            title="Open command palette (Ctrl+K or ⌘K)"
          >
            <Search className="size-3.5 text-muted-foreground" />
            <span className="hidden md:inline">Search cases, suppliers, commands...</span>
            <span className="md:hidden">Search...</span>
            <kbd className="ml-1.5 inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground shadow-sm font-semibold">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2.5">
            <ThemeToggle />
            <NotificationCenter />
            {user ? (
              <div className="flex items-center gap-2.5 border-l border-border pl-4">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt=""
                    className="size-9 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span
                    className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary"
                    aria-hidden
                  >
                    {user.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="hidden sm:block">
                  <p className="max-w-28 truncate text-[12px] leading-4 font-medium">{user.name}</p>
                  <button
                    type="button"
                    onClick={signOut}
                    className="inline-flex items-center gap-1 text-[11px] leading-4 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <LogOut className="size-3" aria-hidden /> Sign out
                  </button>
                </div>
              </div>
            ) : (
              <Link
                to="/sign-in"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[12px] font-semibold text-foreground shadow-sm transition-colors hover:border-primary/35 hover:text-primary"
              >
                <LogIn className="size-3.5" aria-hidden /> Sign in
              </Link>
            )}
          </div>
        </header>

        <div className="lg:hidden">
          <nav
            className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2"
            aria-label="Main mobile"
          >
            {nav.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                activeProps={{ className: "bg-primary/12 text-primary" }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Live Defense Marquee Scroller */}
        <LiveTelemetryTicker />

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1480px]">{children}</div>
        </main>
      </div>

      <CommandPalette open={openCmd} onOpenChange={setOpenCmd} />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-bold tracking-[-0.035em]">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Compact inline notice used when live mode cannot reach the analysis service. */
export function ConnectionNotice({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (DEMO_MODE) return null; // Never display backend errors when running in Demo Mode!

  const detail = error instanceof Error ? error.message : "Service did not respond.";
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-[12.5px] text-foreground shadow-sm">
      <WifiOff className="size-4 shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1">
        Using local database baseline. <span className="text-muted-foreground">{detail}</span>
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border border-warning/30 bg-card px-3 py-1 text-[11.5px] font-semibold text-foreground transition-colors duration-150 hover:bg-warning/20"
      >
        <RefreshCw className="size-3" aria-hidden />
        Retry Connection
      </button>
    </div>
  );
}

export function EmptyState({
  icon: Icon = FileSearch,
  message,
  action,
}: {
  icon?: typeof FileSearch;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--sunken)] text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <p className="text-[13px] text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

export function StateBlock({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="panel px-6 py-12 text-center">
      <p className="text-[13px] font-medium">{title}</p>
      {detail && <p className="mt-1 text-[13px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export interface SecurityNotification {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  severity: "critical" | "warning" | "info";
  caseId?: string;
  read: boolean;
}

const DEFAULT_NOTIFICATIONS: SecurityNotification[] = [
  {
    id: "notif-1",
    title: "Autonomous Payment Hold Triggered",
    detail:
      "Case SM-1062: Beneficiary bank account alteration intercepted on wire transfer ($184,320).",
    timestamp: "Just now",
    severity: "critical",
    caseId: "fb1a5933-19a3-4e4b-b300-71db17495f62",
    read: false,
  },
  {
    id: "notif-2",
    title: "Mailbox Gateways Synchronized",
    detail:
      "Microsoft 365 & Google Workspace webhook listeners ingested and triaged 7 inbound messages.",
    timestamp: "12m ago",
    severity: "info",
    read: false,
  },
];

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<SecurityNotification[]>(DEFAULT_NOTIFICATIONS);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const markItemAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const addSimulatedAlert = () => {
    const newAlert: SecurityNotification = {
      id: `sim-${Date.now()}`,
      title: "Executive Impersonation Flagged",
      detail: "CEO display-name spoofing with external domain mismatch flagged in inbound queue.",
      timestamp: "Just now",
      severity: "warning",
      read: false,
    };
    setNotifications((prev) => [newAlert, ...prev]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        className={cn(
          "relative rounded-xl p-2 text-muted-foreground transition-colors duration-150 hover:bg-muted/50 hover:text-foreground cursor-pointer",
          open && "bg-muted text-foreground ring-2 ring-primary/20",
        )}
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-destructive" />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications panel"
          className="absolute right-0 top-full z-50 mt-2 w-[340px] sm:w-[380px] rounded-2xl border border-border bg-card p-0 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold tracking-tight text-foreground">
                Notifications
              </span>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive border border-destructive/20">
                  {unreadCount} new
                </span>
              ) : (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  0 unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {notifications.length > 0 && (
                <>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      title="Mark all as read"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                    >
                      <CheckCheck className="size-3.5 text-muted-foreground" />
                      Mark read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearAll}
                    title="Clear all notifications"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive cursor-pointer"
                  >
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    Clear
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[380px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-9 text-center">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-muted-foreground mb-3 shadow-inner">
                  <BellOff className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">No notifications</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground max-w-[250px]">
                  All security events and mailbox telemetry are up to date. No actions required.
                </p>
                <button
                  type="button"
                  onClick={addSimulatedAlert}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
                >
                  <Sparkles className="size-3 text-warning" />
                  Simulate Alert
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((item) => (
                  <li
                    key={item.id}
                    onClick={() => markItemAsRead(item.id)}
                    className={cn(
                      "group relative flex items-start gap-3 p-3.5 transition-colors duration-150 cursor-pointer",
                      !item.read ? "bg-secondary/60 hover:bg-secondary" : "hover:bg-secondary/40",
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {item.severity === "critical" ? (
                        <span className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                          <ShieldAlert className="size-3.5" />
                        </span>
                      ) : item.severity === "warning" ? (
                        <span className="flex size-7 items-center justify-center rounded-lg bg-warning/10 text-warning border border-warning/20">
                          <ShieldAlert className="size-3.5" />
                        </span>
                      ) : (
                        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                          <Info className="size-3.5" />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={cn(
                            "truncate text-xs",
                            !item.read
                              ? "font-semibold text-foreground"
                              : "font-medium text-foreground/80",
                          )}
                        >
                          {item.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {item.timestamp}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                        {item.detail}
                      </p>

                      {item.caseId && (
                        <div className="mt-2">
                          <Link
                            to="/cases/$caseId"
                            params={{ caseId: item.caseId }}
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            View investigation
                            <ExternalLink className="size-3" />
                          </Link>
                        </div>
                      )}
                    </div>

                    {!item.read && (
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border bg-card px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Autonomous Security Telemetry</span>
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Preferences
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
