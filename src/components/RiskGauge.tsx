import { useEffect, useId, useState } from "react";
import type { Severity } from "@/types/sentinel";

interface RiskGaugeProps {
  score: number;
  severity?: Severity;
  confidence?: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function RiskGauge({
  score: targetScore,
  severity,
  confidence,
  label = "Risk Index",
  size = "md",
  className = "",
}: RiskGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const gradientId = useId();
  const glowFilterId = useId();

  // Spring animation on mount & when targetScore changes
  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1000; // ms
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);

      // High-order smooth spring ease-out
      const eased = 1 - Math.pow(1 - progress, 3.5);
      setAnimatedScore(eased * targetScore);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setAnimatedScore(targetScore);
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [targetScore]);

  // Geometry: 240° symmetrical radial arc from 150° (bottom-left) to 390° (bottom-right)
  const cx = 110;
  const cy = 100;
  const r = 74;
  const startAngleDeg = 150;
  const totalSweepDeg = 240;

  // Arc path: starts at 150°, sweeps clockwise through top (270°) to 390° (30°)
  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = ((startAngleDeg + totalSweepDeg) * Math.PI) / 180;

  const startX = cx + r * Math.cos(startRad);
  const startY = cy + r * Math.sin(startRad);
  const endX = cx + r * Math.cos(endRad);
  const endY = cy + r * Math.sin(endRad);

  const arcPath = `M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${r} ${r} 0 1 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;

  // Total perimeter of this 240° arc
  const totalArcLength = 2 * Math.PI * r * (totalSweepDeg / 360);

  // Clamped score between 0 and 100
  const clampedScore = Math.max(0, Math.min(100, animatedScore));
  const currentFillLength = (clampedScore / 100) * totalArcLength;

  // Tip coordinate of the leading needle bead
  const currentAngleDeg = startAngleDeg + (clampedScore / 100) * totalSweepDeg;
  const currentAngleRad = (currentAngleDeg * Math.PI) / 180;
  const tipX = cx + r * Math.cos(currentAngleRad);
  const tipY = cy + r * Math.sin(currentAngleRad);

  // Color config based on score & severity
  const isCritical = targetScore >= 75 || severity === "critical";
  const isHigh = !isCritical && (targetScore >= 50 || severity === "high");
  const isModerate = !isCritical && !isHigh && (targetScore >= 25 || severity === "medium");

  const colors = isCritical
    ? {
        start: "#fb7185", // rose-400
        end: "#e11d48", // rose-600
        accent: "#e11d48",
        glow: "rgba(225, 29, 72, 0.35)",
        badgeBg: "bg-destructive/10 text-destructive border-destructive/25",
        label: "CRITICAL THREAT",
      }
    : isHigh
      ? {
          start: "#fbbf24", // amber-400
          end: "#ea580c", // orange-600
          accent: "#ea580c",
          glow: "rgba(234, 88, 12, 0.35)",
          badgeBg: "bg-warning/10 text-warning border-warning/25",
          label: "HIGH THREAT",
        }
      : isModerate
        ? {
            start: "#facc15", // yellow-400
            end: "#d97706", // amber-600
            accent: "#d97706",
            glow: "rgba(217, 119, 6, 0.3)",
            badgeBg: "bg-warning/10 text-warning border-warning/25",
            label: "ELEVATED RISK",
          }
        : {
            start: "#34d399", // emerald-400
            end: "#059669", // emerald-600
            accent: "#059669",
            glow: "rgba(5, 150, 105, 0.3)",
            badgeBg: "bg-safe/10 text-safe border-safe/25",
            label: "SAFE / TRUSTED",
          };

  // Tick markers at 0%, 25%, 50%, 75%, 100%
  const ticks = [
    { fraction: 0, label: "0" },
    { fraction: 0.25, label: "25" },
    { fraction: 0.5, label: "50" },
    { fraction: 0.75, label: "75" },
    { fraction: 1.0, label: "100" },
  ];

  const dim =
    size === "sm"
      ? { width: "w-[150px]", height: "aspect-[220/165]" }
      : size === "lg"
        ? { width: "w-[260px]", height: "aspect-[220/165]" }
        : { width: "w-[195px]", height: "aspect-[220/165]" };

  const roundedScore = Math.round(clampedScore);

  return (
    <div className={`relative flex flex-col items-center select-none ${className}`}>
      {/* SVG Arc Container */}
      <div className={`relative ${dim.width} ${dim.height}`}>
        <svg
          viewBox="0 0 220 155"
          className="w-full h-full overflow-visible"
          aria-label={`Risk score: ${roundedScore} out of 100 (${colors.label})`}
          role="img"
        >
          <defs>
            {/* Dynamic Linear Gradient along the stroke */}
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colors.start} />
              <stop offset="100%" stopColor={colors.end} />
            </linearGradient>

            {/* Subtle Drop-Shadow Glow Filter */}
            <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="3"
                floodColor={colors.accent}
                floodOpacity="0.4"
              />
            </filter>
          </defs>

          {/* 1. Track Rail Background */}
          <path
            d={arcPath}
            fill="none"
            stroke="currentColor"
            className="text-border/60 dark:text-muted/30"
            strokeWidth="11"
            strokeLinecap="round"
          />

          {/* 2. Scale Ticks */}
          {ticks.map((tick, i) => {
            const angle = startAngleDeg + tick.fraction * totalSweepDeg;
            const rad = (angle * Math.PI) / 180;
            const rInner = 61;
            const rOuter = 66;
            const x1 = cx + rInner * Math.cos(rad);
            const y1 = cy + rInner * Math.sin(rad);
            const x2 = cx + rOuter * Math.cos(rad);
            const y2 = cy + rOuter * Math.sin(rad);

            const isPassed = clampedScore / 100 >= tick.fraction;

            return (
              <g key={i}>
                <line
                  x1={x1.toFixed(2)}
                  y1={y1.toFixed(2)}
                  x2={x2.toFixed(2)}
                  y2={y2.toFixed(2)}
                  stroke={isPassed ? colors.accent : "currentColor"}
                  className={isPassed ? "" : "text-border dark:text-muted-foreground/30"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* 3. Active Filled Spring Arc */}
          {clampedScore > 0 && (
            <path
              d={arcPath}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={`${currentFillLength} ${totalArcLength}`}
              filter={`url(#${glowFilterId})`}
            />
          )}

          {/* 4. Leading Needle Tip Bead */}
          {clampedScore > 0 && (
            <g className="transition-transform duration-75">
              {/* Outer soft glow ring */}
              <circle cx={tipX} cy={tipY} r="8" fill={colors.accent} opacity="0.28" />
              {/* Solid inner pearl bead with sharp border */}
              <circle
                cx={tipX}
                cy={tipY}
                r="4.5"
                fill="currentColor"
                stroke={colors.accent}
                strokeWidth="2.5"
                className="text-card drop-shadow-sm"
              />
            </g>
          )}

          {/* Scale Labels: 0 and 100 */}
          <text
            x={cx - 65}
            y={cy + 42}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] font-mono font-medium"
          >
            0
          </text>
          <text
            x={cx + 65}
            y={cy + 42}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] font-mono font-medium"
          >
            100
          </text>
        </svg>

        {/* 5. Central Digital Readout (Nested in Center) */}
        <div className="absolute inset-0 top-[28px] flex flex-col items-center justify-center pointer-events-none">
          <div className="flex items-baseline gap-0.5">
            <span className="font-mono text-3xl font-extrabold tracking-tight text-foreground tabular-nums">
              {roundedScore}
            </span>
            <span className="font-mono text-xs font-semibold text-muted-foreground">/100</span>
          </div>
          <span className="mt-0.5 text-[9px] font-bold tracking-widest text-muted-foreground uppercase">
            {label}
          </span>
        </div>
      </div>

      {/* 6. Dynamic Risk Badge Callout */}
      <div className="mt-0.5 flex flex-col items-center gap-1">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${colors.badgeBg}`}
        >
          {colors.label}
        </span>
        {confidence !== undefined && (
          <span className="text-[10px] text-slate-400 font-mono">
            {Math.round(confidence * 100)}% ML Confidence
          </span>
        )}
      </div>
    </div>
  );
}
