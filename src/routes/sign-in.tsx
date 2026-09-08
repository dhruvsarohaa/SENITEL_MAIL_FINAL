import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  Zap,
  Sparkles,
  ShieldAlert,
  Fingerprint,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { renderGoogleButton } from "@/lib/google-auth";
import { SentinelLogoIcon } from "@/components/SentinelLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
  head: () => ({ meta: [{ title: "Sign in — SentinelMail Autonomous BEC Defense" }] }),
});

export function SignInPage() {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { user, isConfigured, completeSignIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [navigate, user]);

  useEffect(() => {
    const container = buttonRef.current;
    if (!container || !isConfigured) return;
    void renderGoogleButton(
      container,
      (profile) => completeSignIn(profile),
      (message) => setError(message),
    );
  }, [completeSignIn, isConfigured]);

  const enterDemoWorkspace = () => {
    completeSignIn({
      id: "demo-analyst",
      email: "alex.mercer@sentinelmail.io",
      name: "Alex Mercer (Lead Analyst)",
      role: "admin",
    });
    navigate({ to: "/" });
  };

  return (
    <main className="relative grid min-h-screen w-full bg-background text-foreground lg:grid-cols-[1.15fr_0.85fr]">
      {/* ── LEFT SHOWCASE: Animated Enterprise Threat Intelligence Center ── */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#090d16] p-10 text-white lg:flex xl:p-14 border-r border-border/40">
        {/* Ambient background glows */}
        <div className="pointer-events-none absolute -top-40 -left-40 size-[500px] rounded-full bg-blue-600/15 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 right-10 size-[450px] rounded-full bg-emerald-500/10 blur-[140px]" />
        <div className="pointer-events-none absolute top-1/2 left-1/3 size-[300px] rounded-full bg-rose-500/10 blur-[100px]" />

        {/* Subtle grid mesh */}
        <div
          className="pointer-events-none absolute inset-0 opacity-15"
          style={{
            backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex size-11 items-center justify-center rounded-xl bg-slate-900 border border-slate-700/60 p-2 shadow-md">
              <SentinelLogoIcon size="100%" className="w-full h-full object-contain" />
              <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-emerald-400 ring-2 ring-[#090d16]" />
            </span>
            <div>
              <span className="flex items-center gap-2">
                <strong className="text-[17px] font-bold tracking-tight text-white">
                  SentinelMail
                </strong>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[9px] font-semibold tracking-wider text-blue-300 uppercase border border-blue-500/30">
                  ENTERPRISE
                </span>
              </span>
              <span className="block text-[11px] font-medium text-slate-400">
                Autonomous BEC & Wire Fraud Protection
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-emerald-400 backdrop-blur-md">
            <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
            Live Threat Radar Active
          </div>
        </div>

        {/* CENTER INTERACTIVE RADAR & FLOATING INCIDENT CARDS */}
        <div className="relative z-10 my-auto py-8">
          <div className="relative mx-auto flex h-[380px] max-w-lg items-center justify-center">
            {/* Concentric Radar Rings */}
            <div className="absolute size-[340px] rounded-full border border-white/10" />
            <div className="absolute size-[240px] rounded-full border border-dashed border-white/15" />
            <div className="absolute size-[140px] rounded-full border border-white/20" />
            <div className="absolute size-2 rounded-full bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,1)]" />

            {/* Radar Crosshairs */}
            <div className="absolute h-[340px] w-px bg-white/10" />
            <div className="absolute w-[340px] h-px bg-white/10" />

            {/* Sweeping Radar Beam */}
            <div className="pointer-events-none absolute size-[340px] rounded-full overflow-hidden">
              <div
                className="animate-radar-sweep absolute top-0 left-0 size-[340px] origin-center"
                style={{
                  background:
                    "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, rgba(59, 130, 246, 0.4) 360deg)",
                }}
              />
            </div>

            {/* Floating Live Case 1: Intercepted Invoice Fraud */}
            <div className="animate-float-slow absolute -top-4 -left-6 z-20 w-[290px] rounded-2xl border border-white/15 bg-[#111927]/90 p-4 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
                    <ShieldAlert className="size-3.5" />
                  </span>
                  <span className="font-mono text-[11px] font-bold text-white">SM-1042</span>
                </div>
                <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[9px] font-bold text-rose-300 uppercase">
                  HOLD PAYMENT
                </span>
              </div>
              <p className="mt-2.5 text-[12px] font-semibold text-slate-100">
                Supply Co Industrial
              </p>
              <p className="text-[11px] text-slate-400">Remittance Account Suffix Diverted</p>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 font-mono text-[11px]">
                <span className="text-slate-400">Protected Wire</span>
                <span className="font-bold text-amber-400">$184,320.00 USD</span>
              </div>
            </div>

            {/* Floating Live Case 2: Compromised Genuine Mailbox */}
            <div className="animate-float-delayed absolute -bottom-4 -right-4 z-20 w-[300px] rounded-2xl border border-white/15 bg-[#111927]/90 p-4 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                    <Fingerprint className="size-3.5" />
                  </span>
                  <span className="font-mono text-[11px] font-bold text-white">SM-1037</span>
                </div>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                  SPF/DKIM: PASS
                </span>
              </div>
              <p className="mt-2.5 text-[12px] font-semibold text-slate-100">Apex Global Cloud</p>
              <p className="text-[11px] text-slate-400">Behavioral Break: Unseen Reply-To</p>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 font-mono text-[11px]">
                <span className="text-slate-400">Autonomous Triage</span>
                <span className="font-bold text-emerald-400">&lt; 1.8 seconds</span>
              </div>
            </div>
          </div>

          {/* Value Prop Banner */}
          <div className="mx-auto mt-6 max-w-lg text-center">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Catch the threats SPF &amp; DKIM cannot see.
            </h2>
            <p className="mt-2.5 text-[14px] leading-relaxed text-slate-400">
              When genuine vendor accounts are compromised, traditional email filters fail.
              SentinelMail detects behavioral breaks in vendor payment relationships.
            </p>
          </div>
        </div>

        {/* BOTTOM REAL-TIME TELEMETRY TICKER */}
        <div className="relative z-10 overflow-hidden border-t border-white/10 pt-4">
          <div className="flex items-center gap-6 whitespace-nowrap font-mono text-[10.5px] text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              TELEMETRY:
            </span>
            <span className="text-slate-300">[M365 CONNECTOR: 142 MSG/MIN]</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300">[GOOGLE PUBSUB: LISTENING]</span>
            <span className="text-slate-500">•</span>
            <span className="text-amber-400 font-medium">[AUTO-HOLD APPLIED: SM-1044]</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300">[ZERO EMAIL RETENTION ENFORCED]</span>
          </div>
        </div>
      </section>

      {/* ── RIGHT AUTH PANEL: Modern Enterprise Login ── */}
      <section className="relative flex min-h-screen flex-col justify-between p-6 sm:p-10 lg:p-12 overflow-y-auto">
        {/* Top Navbar items */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-9 items-center justify-center rounded-xl bg-card border border-border p-1.5 shadow-sm shrink-0">
              <SentinelLogoIcon size="100%" className="w-full h-full object-contain" />
              <span className="absolute -top-1 -right-1 size-2 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
            </span>
            <span className="text-base font-bold tracking-tight text-foreground font-sans">
              Sentinel<span className="text-primary font-semibold">Mail</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-card/60 border border-border/80 px-2.5 py-1 rounded-full backdrop-blur-sm">
              <LockKeyhole className="size-3 text-emerald-500" />
              SOC 2 Type II
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Centered Auth Card */}
        <div className="mx-auto my-auto w-full max-w-[440px] py-8">
          <div className="rounded-2xl border border-border/90 bg-card/90 p-7 sm:p-9 shadow-2xl backdrop-blur-xl">
            {/* Header Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Zap className="size-3.5 fill-primary text-primary" />
              Enterprise Access Portal
            </div>

            <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Welcome to SentinelMail
            </h1>
            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
              Sign in with your corporate identity or launch the interactive live evaluation
              console.
            </p>

            {/* Quick Launch Demo Workspace Button */}
            <div className="mt-6">
              <button
                type="button"
                onClick={enterDemoWorkspace}
                className="group relative flex w-full items-center justify-between overflow-hidden rounded-xl bg-primary px-5 py-4 text-left text-primary-foreground shadow-lg transition-all duration-200 hover:bg-primary/90 hover:shadow-xl hover:ring-2 hover:ring-primary/40 active:scale-[0.99] cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white/20 text-white transition-transform group-hover:scale-110">
                    <Sparkles className="size-4.5 text-white" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-primary-foreground leading-snug">
                      Open Live Investigation Workspace
                    </p>
                    <p className="text-[11px] text-primary-foreground/80 leading-snug">
                      One-click evaluation access with pre-seeded telemetry
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-primary-foreground/80 transition-transform group-hover:translate-x-1 group-hover:text-primary-foreground shrink-0" />
              </button>
            </div>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                <span className="bg-card px-3 font-semibold text-muted-foreground">
                  or corporate identity
                </span>
              </div>
            </div>

            {/* Google Workspace Auth Container */}
            <div className="flex justify-center min-h-[44px] w-full" ref={buttonRef} />

            {!isConfigured && (
              <div className="mt-4 rounded-xl border border-border/80 bg-background/50 p-3.5 text-xs leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground">Ready for Google Workspace SSO</p>
                <p className="mt-0.5 text-muted-foreground text-[11.5px]">
                  Configure{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                    VITE_GOOGLE_CLIENT_ID
                  </code>{" "}
                  in environment to enable production Google SSO.
                </p>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium">
                {error}
              </p>
            )}

            {/* Trust & Compliance checklist */}
            <div className="mt-6 space-y-2.5 border-t border-border/80 pt-5">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-safe shrink-0" />
                <span>Microsoft 365 &amp; Google Workspace Mailbox Ingestion</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-safe shrink-0" />
                <span>Multi-Tenant Row-Level Isolation (SOC 2 Type II)</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-safe shrink-0" />
                <span>Real-Time Autonomous Payment Hold Automation</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 text-center">
          <p className="text-[11px] text-muted-foreground">
            SentinelMail Platform v2.4 Enterprise • Confidential Finance Protection Operations
          </p>
        </div>
      </section>
    </main>
  );
}
