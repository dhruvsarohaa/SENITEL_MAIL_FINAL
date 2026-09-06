import { useCallback, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Brain,
  CheckCircle2,
  FileCheck,
  FileText,
  Fingerprint,
  Layers,
  Loader2,
  Lock,
  Mail,
  Network,
  Play,
  Route as RouteIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserX,
  X,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analyze")({
  head: () => ({
    meta: [
      { title: "Analyze suspicious email — SentinelMail" },
      {
        name: "description",
        content:
          "Upload an .eml message for local forensic analysis of invoice fraud, impersonation, phishing and malware delivery.",
      },
      { property: "og:title", content: "Analyze suspicious email — SentinelMail" },
      {
        property: "og:description",
        content: "Upload an .eml message for local forensic BEC analysis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyzePage,
});

const STAGES = [
  "Parsing RFC822 headers & MIME body",
  "Extracting IOCs (domains, URLs, IPs, hashes)",
  "Comparing vendor baseline & bank accounts",
  "Running multi-layer threat classifier",
  "Correlating cross-tenant campaign clusters",
  "Generating autonomous containment decision",
];

const CHECKS = [
  {
    icon: Brain,
    title: "1. Intent & Behavioral NLP",
    detail:
      "Classifies financial coercion, urgent wire lures, executive impersonation, and credential phishing.",
  },
  {
    icon: ShieldCheck,
    title: "2. Sender Identity & Auth",
    detail:
      "Validates From, Reply-To, Return-Path, and SPF/DKIM/DMARC alignment against the supplier record.",
  },
  {
    icon: Banknote,
    title: "3. Remittance & Bank Forensics",
    detail:
      "Audits invoice amounts, beneficiary names, and flags unapproved bank account suffixes in real time.",
  },
  {
    icon: RouteIcon,
    title: "4. Mail Routing & Relay Forensics",
    detail:
      "Traces RFC822 Received hop headers with IP, ASN, geolocation, and abnormal latency scoring.",
  },
  {
    icon: Network,
    title: "5. Cross-Tenant Campaign Graph",
    detail:
      "Correlates shared infrastructure, lookalike domains, and compromised banking accounts across all mailboxes.",
  },
];

interface AttackScenario {
  id: string;
  name: string;
  category:
    | "Account Takeover (BEC)"
    | "Invoice Fraud"
    | "Executive Impersonation"
    | "Credential Phishing"
    | "Malware Lure"
    | "Benign Baseline";
  severity: "critical" | "high" | "safe";
  target: string;
  lure: string;
  indicators: string[];
  expectedVerdict: string;
  filename: string;
  emlContent: string;
}

const ATTACK_SCENARIOS: AttackScenario[] = [
  {
    id: "compromised-vendor",
    name: "Compromised Genuine Vendor (Harborline Metals)",
    category: "Account Takeover (BEC)",
    severity: "critical",
    target: "Accounts Payable / Aster Manufacturing",
    lure: "Authentic vendor mailbox compromised. SPF/DKIM 100% PASS, but wire instructions are diverted to unapproved account ending ••••5518.",
    indicators: [
      "SPF/DKIM/DMARC: PASS (Legitimate Mailbox)",
      "Unseen Reply-To (payments@harborline-remit.co)",
      "Unapproved Bank Account (••••5518)",
      "Urgent Same-Day Release Pressure",
    ],
    expectedVerdict: "HOLD PAYMENT · Risk 97",
    filename: "PO-55129-compromised-vendor-harborline.eml",
    emlContent: [
      'From: "Maya Chen — Procurement" <procurement@harborline-metals.com>',
      "To: ap@astermanufacturing.com",
      "Reply-To: payments@harborline-remit.co",
      "Subject: Purchase order PO-55129 revision for approval",
      "Date: Sun, 06 Sep 2026 02:25:00 +0000",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Authentication-Results: mx.astermanufacturing.com; spf=pass (sender IP is authentic); dkim=pass header.d=harborline-metals.com; dmarc=pass action=none",
      "",
      "Dear Accounts Payable Team,",
      "",
      "Attached is the revised purchase order PO-55129 for $38,900.00 USD.",
      "Please note our prior depository account is temporarily unavailable due to scheduled banking migration.",
      "Kindly remit payment to our updated beneficiary account below and confirm release today to ensure scheduled dispatch.",
      "",
      "Updated Remittance Details:",
      "Beneficiary: HARBORLINE METALS GROUP",
      "Bank: First Commercial Trust",
      "Account Number: ••••••••••••5518",
      "",
      "Please confirm once payment has been released today.",
      "",
      "Best regards,",
      "Maya Chen — Procurement Specialist",
      "Harborline Metals Inc.",
    ].join("\r\n"),
  },
  {
    id: "invoice-fraud",
    name: "Vendor Remittance Diversion",
    category: "Invoice Fraud",
    severity: "critical",
    target: "Accounts Payable / Treasury",
    lure: "Depository audit requires rerouting $184,320 wire to an unapproved bank account.",
    indicators: [
      "Lookalike Domain (supplyco-billing.net)",
      "Unapproved Bank Account (••••7741)",
      "Mismatched Reply-To",
    ],
    expectedVerdict: "HOLD PAYMENT · Risk 94",
    filename: "INV-88213-urgent-remittance.eml",
    emlContent: [
      'From: "Supply Co Remittance" <billing@supplyco-billing.net>',
      "To: ap@sentinelcorp.com",
      "Reply-To: accounts.finance@supplyco-billing.net",
      "Subject: Urgent: Depository Account Maintenance for Invoice INV-88213 ($184,320.00)",
      "Date: Sun, 06 Sep 2026 01:25:00 +0000",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Dear Accounts Payable Team,",
      "",
      "Please be advised that our primary depository account is currently undergoing annual regulatory audit.",
      "Effective immediately, all wire remittances for outstanding invoice #INV-88213 ($184,320.00 USD) must be routed to our secondary depository holding account.",
      "",
      "Updated Remittance Details:",
      "Beneficiary Name: SUPPLYCO TRADING HOLDINGS LTD",
      "Bank: Metropolitan Commercial Bank",
      "Account Number: ••••••••••••7741",
      "",
      "Please confirm once wire transaction confirmation is generated today to avoid dispatch holds.",
      "",
      "Sincerely,",
      "Supply Co Remittance Department",
    ].join("\r\n"),
  },
  {
    id: "ceo-impersonation",
    name: "Executive Impersonation (Whaling)",
    category: "Executive Impersonation",
    severity: "high",
    target: "Finance Director / Controller",
    lure: "CEO requests urgent confidential $340,000 escrow wire for an unannounced M&A deal.",
    indicators: [
      "Display Name Spoofing",
      "Secrecy & Urgency Coercion",
      "Unverified Escrow Account",
    ],
    expectedVerdict: "HOLD PAYMENT / ESCALATE · Risk 86",
    filename: "CONFIDENTIAL-CEO-Wire-Request.eml",
    emlContent: [
      'From: "David Miller (CEO)" <david.miller@executive-sentinel.co>',
      "To: finance.director@sentinelcorp.com",
      "Reply-To: executive.office@executive-sentinel.co",
      "Subject: Confidential: Immediate Acquisition Escrow Authorization Required",
      "Date: Sun, 06 Sep 2026 01:45:00 +0000",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Hi,",
      "",
      "I am currently in closed-door M&A negotiations with our legal advisors.",
      "We need an immediate wire of $340,000.00 transferred into the designated escrow account before close of business today to secure exclusivity.",
      "",
      "Keep this strictly confidential between us until the formal board announcement tomorrow.",
      "Wire instructions are attached in our privileged counsel file. Let me know once the transaction reference number is generated.",
      "",
      "Best,",
      "David Miller",
      "Chief Executive Officer",
      "Sentinel Corporation",
    ].join("\r\n"),
  },
  {
    id: "credential-phish",
    name: "M365 Session Token Harvester",
    category: "Credential Phishing",
    severity: "high",
    target: "Corporate Mailbox Users",
    lure: "Fake Microsoft 365 security alert threatening 2-hour account lockout.",
    indicators: [
      "Lookalike Phish URL",
      "Typosquatted Sender Domain",
      "Artificial Urgency Deadline",
    ],
    expectedVerdict: "CONFIRMED THREAT · Risk 89",
    filename: "M365-Security-Alert-Password-Expiry.eml",
    emlContent: [
      'From: "Microsoft 365 Security Operations" <no-reply@security-microsoftonline-verify.com>',
      "To: employee@sentinelcorp.com",
      "Reply-To: compliance@security-microsoftonline-verify.com",
      "Subject: Action Required: Your Microsoft 365 Corporate Session Expires in 2 Hours",
      "Date: Sun, 06 Sep 2026 02:00:00 +0000",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "SECURITY ALERT: Your Microsoft 365 corporate identity token will expire today due to policy inactivity.",
      "",
      "To prevent immediate disruption to Outlook, Teams, and corporate SharePoint access, you must verify your corporate credentials immediately:",
      "https://login.microsoftonline.security-auth-check.net/oauth/sentinelcorp/verify",
      "",
      "Failure to verify within 2 hours will result in automatic directory lockout.",
      "",
      "Microsoft Security Operations",
      "Ticket ID: MS-991823-SEC",
    ].join("\r\n"),
  },
  {
    id: "malware-lure",
    name: "Malicious Attachment Exploit",
    category: "Malware Lure",
    severity: "critical",
    target: "Procurement / Operations",
    lure: "Past-due freight statement delivering double-extension executable file payload.",
    indicators: ["Double Extension (.pdf.exe)", "Untrusted Suffix", "High-Risk SHA-256 Hash"],
    expectedVerdict: "CONFIRMED THREAT / BLOCK · Risk 92",
    filename: "OVERDUE_Statement_8819.pdf.exe.eml",
    emlContent: [
      'From: "Global Freight Dispatch" <dispatch@freight-global-logistics.biz>',
      "To: procurement@sentinelcorp.com",
      "Subject: Final Notice: Overdue Freight Statement of Account #8819",
      "Date: Sun, 06 Sep 2026 02:15:00 +0000",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Dear Customer,",
      "",
      "Our records indicate that Statement #8819 is now 45 days past due.",
      "A legal collection hold has been placed on all active freight consignments.",
      "",
      "Review the attached statement and remit the outstanding balance immediately:",
      "Attachment: Statement_8819_Final_Notice.pdf.exe (SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855)",
      "",
      "Global Freight Collections Team",
    ].join("\r\n"),
  },
  {
    id: "benign-baseline",
    name: "Legitimate Vendor Invoice (Clean)",
    category: "Benign Baseline",
    severity: "safe",
    target: "Accounts Payable",
    lure: "Regular monthly components invoice matching approved supplier and registered bank.",
    indicators: ["SPF/DKIM/DMARC Pass", "Matched Supplier Record", "Approved Bank (••••1142)"],
    expectedVerdict: "NO ACTION REQUIRED · Risk 08",
    filename: "Aster-Manufacturing-Monthly-Invoice-Clean.eml",
    emlContent: [
      'From: "Aster Manufacturing AR" <ar@aster-mfg.com>',
      "To: ap@sentinelcorp.com",
      "Subject: Scheduled Monthly Invoice Remittance #INV-2026-091 - Aster Manufacturing",
      "Date: Sun, 06 Sep 2026 02:30:00 +0000",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Hello Accounts Payable,",
      "",
      "Attached is the regular monthly invoice #INV-2026-091 for components delivered under contract #CON-4481.",
      "Total amount due: $14,500.00 USD.",
      "Please remit payment to our standard depository account ending in 1142 currently on file.",
      "",
      "Thank you for your partnership.",
      "",
      "Best regards,",
      "Accounts Receivable",
      "Aster Manufacturing Inc.",
    ].join("\r\n"),
  },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AnalyzePage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [stage, setStage] = useState(-1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<"scenarios" | "pipeline">("scenarios");

  const vendorsQuery = useQuery({ queryKey: ["vendors"], queryFn: api.listVendors });
  const vendors = vendorsQuery.data?.data ?? [];

  const pickFile = useCallback((f: File | undefined) => {
    setError(null);
    setActiveScenarioId(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".eml")) {
      setError("Only .eml files are supported.");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError("File is larger than the 25 MB limit.");
      return;
    }
    setFile(f);
  }, []);

  function loadScenario(scenario: AttackScenario) {
    setError(null);
    const newFile = new File([scenario.emlContent], scenario.filename, {
      type: "message/rfc822",
    });
    setFile(newFile);
    setActiveScenarioId(scenario.id);
    toast.info(`Loaded "${scenario.name}" test scenario`, {
      description: "Click 'Run Forensic Analysis' to simulate autonomous detection.",
    });
  }

  async function runAnalysis() {
    if (!file || running) return;
    setRunning(true);
    setError(null);
    setStage(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    STAGES.forEach((_, i) => {
      if (i > 0) timers.push(setTimeout(() => setStage(i), i * 500));
    });
    try {
      const result = await api.analyze(file, vendorId || undefined);
      timers.forEach(clearTimeout);
      setStage(STAGES.length);
      toast.success("Analysis complete", { description: "Forensic incident record created." });
      navigate({ to: "/cases/$caseId", params: { caseId: result.case_id } });
    } catch (err) {
      timers.forEach(clearTimeout);
      setStage(-1);
      const message = err instanceof Error ? err.message : "Analysis failed";
      setError(message);
      toast.error("Analysis failed", { description: message });
    } finally {
      setRunning(false);
    }
  }

  const activeScenario = ATTACK_SCENARIOS.find((s) => s.id === activeScenarioId);

  return (
    <AppShell breadcrumb={["Analyze email"]}>
      <PageHeader
        title="Forensic Message Ingestion & Attack Lab"
        description="Submit an inbound .eml payload for autonomous multi-layer inspection, or test SentinelMail's defense against realistic enterprise attack scenarios."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* LEFT COLUMN: HERO CALLOUT + DROPZONE & CONTROLS */}
        <div className="space-y-5">
          {/* HERO CALLOUT BANNER: CASE 2 COMPROMISED GENUINE ACCOUNT */}
          <div className="rounded-2xl border-2 border-destructive/20 bg-gradient-to-r from-destructive/10 via-background to-warning/10 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground shadow-sm">
                  <ShieldAlert className="size-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-destructive/10 border border-destructive/20 px-2.5 py-0.5 text-[10px] font-bold text-destructive uppercase tracking-wider">
                      ★ Lead Qualifier Demo · Case 2
                    </span>
                    <span className="rounded-full bg-safe/10 border border-safe/20 px-2 py-0.5 text-[10px] font-bold text-safe">
                      SPF/DKIM: 100% PASS
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-bold text-foreground">
                    Compromised Genuine Vendor Account (Harborline Metals)
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Why SEGs fail:</strong> Traditional email
                    security passes this because the sending mailbox is authentic.{" "}
                    <strong className="text-destructive">SentinelMail intercepts it</strong> because
                    the payment relationship is hijacked (unapproved bank{" "}
                    <code className="font-mono bg-background px-1.5 py-0.5 rounded border border-destructive/20 text-destructive font-semibold">
                      ••••5518
                    </code>{" "}
                    + unseen Reply-To).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => loadScenario(ATTACK_SCENARIOS[0]!)}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-destructive hover:bg-destructive/90 px-4 py-2.5 text-xs font-bold text-destructive-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <Sparkles className="size-3.5 text-amber-300" />
                1-Click Load &amp; Test Case 2
              </button>
            </div>
          </div>

          <section className="panel p-6">
            {/* DROPZONE */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload .eml file"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition-all duration-150 relative overflow-hidden",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary/50 hover:border-primary/50 hover:bg-secondary",
              )}
            >
              <span className="mb-4 flex size-13 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <UploadCloud className="size-6" aria-hidden />
              </span>
              <p className="text-base font-bold text-foreground">
                Drop a suspicious RFC822 (.eml) message here
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supported format: <strong className="font-mono text-foreground">.eml</strong> · Up
                to 25 MB
              </p>

              <button
                type="button"
                className="mt-4 rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary cursor-pointer"
              >
                Browse local files
              </button>

              <p className="mt-4 text-xs text-muted-foreground font-medium">
                Protected sandbox: attachments and active scripts are neutralized.
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".eml,message/rfc822"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive">
                <AlertOctagon className="size-4 shrink-0 text-destructive" />
                <span>{error}</span>
              </div>
            )}

            {/* ACTIVE FILE CHIP */}
            {file && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <FileText className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(file.size)} · RFC822 Raw Payload
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeScenario && (
                    <span className="hidden sm:inline-flex rounded-full bg-secondary border border-border px-2.5 py-0.5 text-xs font-semibold text-foreground">
                      Scenario: {activeScenario.category}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setActiveScenarioId(null);
                    }}
                    aria-label="Remove file"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}

            {/* SUPPLIER BASELINE SELECTOR & RUN BUTTON */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <label
                  htmlFor="vendor"
                  className="mb-1 block text-xs font-semibold text-muted-foreground"
                >
                  Supplier Baseline Alignment
                </label>
                <select
                  id="vendor"
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-sm cursor-pointer"
                >
                  <option value="">Auto-detect from message sender domain</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={runAnalysis}
                  disabled={!file || running}
                  className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 px-6 text-xs font-bold text-primary-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45 disabled:pointer-events-none cursor-pointer"
                >
                  {running ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Executing Pipeline…
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5 fill-current" />
                      Run Forensic Analysis
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* PROGRESS STEPPER */}
          {stage >= 0 && (
            <section className="panel p-5" aria-live="polite">
              <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Loader2 className="size-4 text-primary animate-spin" />
                  Forensic Pipeline Execution in Progress
                </h2>
                <span className="font-mono text-xs text-muted-foreground">
                  Step {Math.min(stage + 1, STAGES.length)} of {STAGES.length}
                </span>
              </div>
              <ol className="space-y-0">
                {STAGES.map((label, i) => {
                  const done = i < stage;
                  const active = i === stage;
                  return (
                    <li key={label} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-full border transition-colors duration-200",
                            done
                              ? "border-safe bg-safe/10 text-safe"
                              : active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground",
                          )}
                        >
                          {done ? (
                            <CheckCircle2 className="size-3" aria-hidden />
                          ) : active ? (
                            <Loader2 className="size-3 animate-spin" aria-hidden />
                          ) : (
                            <span className="size-1.5 rounded-full bg-current" aria-hidden />
                          )}
                        </span>
                        {i < STAGES.length - 1 && (
                          <span
                            className={cn("w-px flex-1", done ? "bg-safe/50" : "bg-border")}
                            aria-hidden
                          />
                        )}
                      </div>
                      <p
                        className={cn(
                          "pb-3.5 text-xs font-medium",
                          done
                            ? "text-foreground"
                            : active
                              ? "text-primary font-bold"
                              : "text-muted-foreground",
                        )}
                      >
                        {label}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN: ATTACK SCENARIO SUITE & DETECTION PIPELINE */}
        <div className="space-y-5">
          <section className="panel p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSideTab("scenarios")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    sideTab === "scenarios"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                  )}
                >
                  Attack Scenario Suite (5)
                </button>
                <button
                  type="button"
                  onClick={() => setSideTab("pipeline")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    sideTab === "pipeline"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                  )}
                >
                  Detection Engine Pipeline
                </button>
              </div>
            </div>

            {sideTab === "scenarios" ? (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Load pre-configured corporate attack scenarios to verify SentinelMail’s autonomous
                  triage, vendor baseline matching, and payment interception rules.
                </p>

                <div className="space-y-3">
                  {ATTACK_SCENARIOS.map((scenario) => {
                    const isLoaded = activeScenarioId === scenario.id;
                    const sevBadgeTone =
                      scenario.severity === "critical"
                        ? "bg-destructive/10 text-destructive border-destructive/20"
                        : scenario.severity === "high"
                          ? "bg-warning/10 text-warning border-warning/20"
                          : "bg-safe/10 text-safe border-safe/20";

                    return (
                      <div
                        key={scenario.id}
                        className={cn(
                          "rounded-xl border p-4 transition-all duration-150",
                          isLoaded
                            ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                            : "border-border bg-card hover:border-border-strong hover:bg-secondary/50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                  sevBadgeTone,
                                )}
                              >
                                {scenario.category}
                              </span>
                              <span className="font-mono text-xs font-semibold text-muted-foreground">
                                Target: {scenario.target}
                              </span>
                            </div>
                            <h3 className="mt-1.5 text-sm font-bold text-foreground">
                              {scenario.name}
                            </h3>
                          </div>

                          <button
                            type="button"
                            onClick={() => loadScenario(scenario)}
                            className={cn(
                              "shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shadow-sm cursor-pointer",
                              isLoaded
                                ? "bg-safe text-primary-foreground"
                                : "bg-primary text-primary-foreground hover:bg-primary/90",
                            )}
                          >
                            {isLoaded ? "Loaded in Dropper" : "Load Scenario"}
                          </button>
                        </div>

                        <p className="mt-2 text-xs text-muted-foreground leading-relaxed font-normal">
                          {scenario.lure}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {scenario.indicators.map((ind) => (
                            <span
                              key={ind}
                              className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground font-medium"
                            >
                              {ind}
                            </span>
                          ))}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-xs font-medium text-muted-foreground">
                          <span>Expected Verdict:</span>
                          <span className="font-mono font-bold text-foreground">
                            {scenario.expectedVerdict}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Every inbound message is evaluated through 5 discrete forensic passes before an
                  autonomous containment decision is rendered.
                </p>

                <ol className="space-y-3">
                  {CHECKS.map(({ icon: Icon, title, detail }, i) => (
                    <li
                      key={title}
                      className="rounded-xl border border-border bg-secondary p-4 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-foreground">{title}</p>
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed font-normal">
                            {detail}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
