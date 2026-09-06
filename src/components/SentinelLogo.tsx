import React from "react";
import { cn } from "@/lib/utils";

interface SentinelLogoIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  variant?: "vector" | "raster";
}

/**
 * High-fidelity vector replica of the official SentinelMail envelope + gold shield logo icon.
 * Scales cleanly to any dimension with zero pixelation in both dark and light modes.
 */
export function SentinelLogoIcon({
  size = 24,
  className,
  variant = "raster",
  ...props
}: SentinelLogoIconProps) {
  if (variant === "raster") {
    return (
      <img
        src="/logo-icon-transparent.png"
        alt="SentinelMail"
        width={typeof size === "number" ? size : undefined}
        height={typeof size === "number" ? size : undefined}
        className={cn("object-contain shrink-0", className)}
        style={{
          width: typeof size === "string" ? size : `${size}px`,
          height: typeof size === "string" ? size : `${size}px`,
        }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 100 68"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none overflow-visible", className)}
      style={{
        width: typeof size === "string" ? size : `${size}px`,
        height: typeof size === "string" ? size : `${size}px`,
      }}
      aria-label="SentinelMail Logo Icon"
      role="img"
      {...props}
    >
      {/* Drop shadow / glow behind icon */}
      <defs>
        <filter id="sentinel-shield-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#f59e0b" floodOpacity="0.45" />
        </filter>
        <filter id="sentinel-card-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Outer Envelope Body in Obsidian Midnight */}
      <rect
        x="2"
        y="2"
        width="96"
        height="64"
        rx="6"
        fill="#090D1A"
        stroke="#1E293B"
        strokeWidth="1.5"
        filter="url(#sentinel-card-shadow)"
      />

      {/* Gold Shield Seal Clasp (Positioned at Flap Apex) */}
      <path
        d="M38 27 C38 43, 50 52, 50 53 C50 52, 62 43, 62 27 Z"
        fill="url(#gold-gradient)"
        filter="url(#sentinel-shield-glow)"
      />

      {/* Gradient for the Gold Shield */}
      <defs>
        <linearGradient
          id="gold-gradient"
          x1="50"
          y1="27"
          x2="50"
          y2="53"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>

      {/* Bottom Corner Envelope Fold Seams (White diagonal lines) */}
      <line x1="2" y1="66" x2="41" y2="30" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
      <line
        x1="98"
        y1="66"
        x2="59"
        y2="30"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Top Envelope Flap Fold Seam (V-shape with rounded point) */}
      <path
        d="M3 3 L45.5 31 C48.5 33, 51.5 33, 54.5 31 L97 3"
        stroke="#ffffff"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface SentinelLogoProps {
  size?: "sm" | "md" | "lg";
  showBadge?: boolean;
  className?: string;
  badgeText?: string;
}

/**
 * Complete SentinelMail brand mark with icon + typography.
 */
export function SentinelLogo({
  size = "md",
  showBadge = true,
  className,
  badgeText = "LIVE",
}: SentinelLogoProps) {
  const iconSizes = {
    sm: 22,
    md: 28,
    lg: 38,
  };

  const textSizes = {
    sm: "text-sm",
    md: "text-[15.5px]",
    lg: "text-2xl",
  };

  const badgeSizes = {
    sm: "text-[8px] px-1 py-0.2",
    md: "text-[8.5px] px-1.5 py-0.5",
    lg: "text-[10px] px-2 py-0.5",
  };

  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <div className="relative flex items-center justify-center shrink-0 rounded-xl bg-white p-1 shadow-sm border border-slate-200/50">
        <SentinelLogoIcon size={iconSizes[size]} variant="raster" />
        <span className="absolute -top-1 -right-1 size-2 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
      </div>

      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-extrabold tracking-tight text-foreground font-sans",
              textSizes[size],
            )}
          >
            <span className="text-foreground">Sentinel</span>
            <span className="text-foreground font-semibold">Mail</span>
          </span>
          {showBadge && (
            <span
              className={cn(
                "rounded-full font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                badgeSizes[size],
              )}
            >
              {badgeText}
            </span>
          )}
        </div>
        {size === "lg" && (
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Autonomous BEC & Financial Defense
          </span>
        )}
      </div>
    </div>
  );
}
