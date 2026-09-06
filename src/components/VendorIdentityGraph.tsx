import type { Case } from "@/types/sentinel";

function shortLabel(value: string, limit = 26) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function Node({
  x,
  y,
  label,
  caption,
  tone = "trusted",
}: {
  x: number;
  y: number;
  label: string;
  caption: string;
  tone?: "trusted" | "suspicious" | "neutral";
}) {
  const palette =
    tone === "suspicious"
      ? {
          fill: "color-mix(in oklab, var(--critical) 10%, var(--surface))",
          stroke: "var(--critical)",
          text: "var(--critical)",
        }
      : tone === "trusted"
        ? {
            fill: "color-mix(in oklab, var(--safe) 9%, var(--surface))",
            stroke: "var(--safe)",
            text: "var(--foreground)",
          }
        : {
            fill: "var(--surface-raised)",
            stroke: "var(--border-strong)",
            text: "var(--foreground)",
          };

  return (
    <g>
      <rect
        x={x - 78}
        y={y - 24}
        width="156"
        height="48"
        rx="10"
        fill={palette.fill}
        stroke={palette.stroke}
        strokeWidth="1.4"
      />
      <text x={x} y={y - 2} textAnchor="middle" fontSize="11" fontWeight="600" fill={palette.text}>
        {shortLabel(label)}
      </text>
      <text x={x} y={y + 14} textAnchor="middle" fontSize="9.5" fill="var(--muted-foreground)">
        {caption}
      </text>
    </g>
  );
}

/** Shows how an authenticated vendor message breaks an established payment relationship. */
export function VendorIdentityGraph({ kase }: { kase: Case }) {
  const baseline = kase.evidence.vendor_relationship;
  const sender = kase.evidence.sender_identity;
  const financial = kase.evidence.financial;

  if (!baseline) return null;

  const suspiciousReplyTo = sender.reply_to ?? "New reply destination";
  const suspiciousBank = financial.bank_account_last4
    ? `Account ••••${financial.bank_account_last4}`
    : "New bank account";

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">Vendor Identity Graph</h2>
        <span className="text-xs text-muted-foreground">The trusted relationship breaks here</span>
      </header>
      <div className="overflow-x-auto p-3">
        <svg
          viewBox="0 0 760 320"
          className="min-w-[700px] w-full"
          role="img"
          aria-label="Trusted vendor relationship broken by a new reply-to address and bank account"
        >
          <path d="M158 130H207M363 130H422" stroke="var(--safe)" strokeWidth="2" />
          <path d="M285 154V201" stroke="var(--critical)" strokeWidth="2" />
          <path d="M363 225 427 205M363 225 427 270" stroke="var(--critical)" strokeWidth="2" />

          <text x="182" y="119" textAnchor="middle" fontSize="9.5" fill="var(--safe)">
            established
          </text>
          <text x="392" y="119" textAnchor="middle" fontSize="9.5" fill="var(--safe)">
            approved
          </text>
          <text x="298" y="181" fontSize="9.5" fill="var(--critical)">
            behavioral break
          </text>

          <Node x={80} y={130} label={baseline.trusted_domain} caption="Trusted vendor domain" />
          <Node x={285} y={130} label={baseline.known_contact} caption="Known contact" />
          <Node
            x={500}
            y={130}
            label={baseline.approved_bank_suffixes.join(" · ")}
            caption="Approved bank account"
          />
          <Node
            x={285}
            y={225}
            label={sender.from_address}
            caption="Suspicious new email"
            tone="suspicious"
          />
          <Node
            x={505}
            y={205}
            label={suspiciousReplyTo}
            caption="New Reply-To"
            tone="suspicious"
          />
          <Node
            x={505}
            y={270}
            label={suspiciousBank}
            caption="New beneficiary account"
            tone="suspicious"
          />
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <span className="size-2 rounded-full bg-safe" /> Trusted baseline
        </span>
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <span className="size-2 rounded-full bg-critical" /> New relationship indicator
        </span>
        <span className="text-muted-foreground">
          Authentication can pass while the payment relationship is hijacked.
        </span>
      </div>
    </section>
  );
}
