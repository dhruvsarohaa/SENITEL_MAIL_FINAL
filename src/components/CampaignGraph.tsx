import { useMemo } from "react";
import type { CampaignGraphData, GraphNode } from "@/types/sentinel";

const typeLabels: Record<GraphNode["type"], string> = {
  email: "Email",
  domain: "Domain",
  url: "URL",
  reply_to: "Reply-To",
  bank_account: "Bank account",
  attachment: "Attachment",
};

/** Deterministic radial layout — no physics, no animation, readable at a glance. */
export function CampaignGraph({ graph }: { graph: CampaignGraphData }) {
  const width = 720;
  const height = 380;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const centers = graph.nodes.filter((n) => n.type === "email");
    const others = graph.nodes.filter((n) => n.type !== "email");

    centers.forEach((n, i) => {
      map.set(n.id, {
        x: width / 2,
        y:
          centers.length === 1
            ? height / 2
            : 90 + (i * (height - 180)) / Math.max(1, centers.length - 1),
      });
    });
    others.forEach((n, i) => {
      const angle = (i / others.length) * Math.PI * 2 - Math.PI / 2;
      map.set(n.id, {
        x: width / 2 + Math.cos(angle) * 250,
        y: height / 2 + Math.sin(angle) * 135,
      });
    });
    return map;
  }, [graph]);

  if (graph.nodes.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No correlated indicators for this case.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[680px] w-full"
        role="img"
        aria-label="Campaign correlation graph of shared indicators"
      >
        {graph.edges.map((e, i) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={e.suspicious ? "var(--critical)" : "var(--border-strong)"}
              strokeWidth={e.suspicious ? 1.8 : 1}
              strokeDasharray={e.suspicious ? undefined : "4 4"}
              opacity={e.suspicious ? 0.8 : 0.6}
            />
          );
        })}
        {graph.nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const isEmail = n.type === "email";
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isEmail ? 22 : 15}
                fill={
                  n.suspicious
                    ? "color-mix(in oklab, var(--critical) 22%, var(--surface))"
                    : "var(--surface-raised)"
                }
                stroke={
                  n.suspicious
                    ? "var(--critical)"
                    : isEmail
                      ? "var(--primary)"
                      : "var(--border-strong)"
                }
                strokeWidth={1.5}
              />
              <text
                x={p.x}
                y={p.y + (isEmail ? 40 : 32)}
                textAnchor="middle"
                fontSize="11"
                fill="var(--foreground)"
              >
                {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
              </text>
              <text
                x={p.x}
                y={p.y + (isEmail ? 54 : 46)}
                textAnchor="middle"
                fontSize="9.5"
                fill="var(--muted-foreground)"
              >
                {typeLabels[n.type]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-critical" /> Suspicious shared indicator
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" /> Email in cluster
        </span>
      </div>
    </div>
  );
}
