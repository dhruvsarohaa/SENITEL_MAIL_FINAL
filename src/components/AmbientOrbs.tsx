import React from "react";

/**
 * AmbientOrbs
 * Continuous gentle floating background orbs with silky soft blending.
 * Uses harmonious cyan, deep indigo, and soft violet gradients that naturally
 * illuminate the frosted glass panels in both light and dark mode.
 */
export function AmbientOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10" aria-hidden="true">
      {/* Orb 1: Electric Cyan Ambient Light */}
      <div
        className="ambient-orb orb-float-1 top-[2%] right-[8%] w-[520px] h-[520px] opacity-25 dark:opacity-20"
        style={{
          background:
            "radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, rgba(56, 189, 248, 0) 70%)",
        }}
      />

      {/* Orb 2: Deep Cyber Indigo Ambient Light */}
      <div
        className="ambient-orb orb-float-2 top-[35%] left-[2%] w-[580px] h-[580px] opacity-20 dark:opacity-25"
        style={{
          background:
            "radial-gradient(circle, rgba(99, 102, 241, 0.20) 0%, rgba(99, 102, 241, 0) 70%)",
        }}
      />

      {/* Orb 3: Luminous Violet / Rose Ambient Light */}
      <div
        className="ambient-orb orb-float-3 bottom-[6%] right-[10%] w-[480px] h-[480px] opacity-15 dark:opacity-18"
        style={{
          background:
            "radial-gradient(circle, rgba(168, 85, 247, 0.18) 0%, rgba(244, 63, 94, 0) 70%)",
        }}
      />
    </div>
  );
}
