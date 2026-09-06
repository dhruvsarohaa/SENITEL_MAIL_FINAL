import { useEffect, useRef } from "react";

/**
 * CustomCursor
 * High-precision interactive cursor inspired by Shivam Maletha's portfolio.
 * Dot follows mouse instantaneously; Outer Ring follows with spring-interpolated lerp.
 * Expands into glowing cyan aura when hovering over interactive elements.
 */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: -100, y: -100 });
  const ringPos = useRef({ x: -100, y: -100 });
  const animFrameId = useRef<number | null>(null);

  useEffect(() => {
    // Check if device has a fine pointer (mouse), not touch
    if (typeof window === "undefined" || window.matchMedia("(hover: none)").matches) {
      return;
    }

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let isVisible = false;

    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;

      if (!isVisible) {
        isVisible = true;
        dot.style.opacity = "1";
        ring.style.opacity = "1";
        ringPos.current.x = e.clientX;
        ringPos.current.y = e.clientY;
      }

      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };

    const handleMouseLeave = () => {
      isVisible = false;
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    };

    const handleMouseEnter = () => {
      isVisible = true;
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    };

    // Global delegation for hoverable items
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const isInteractive = Boolean(
        target.closest(
          "a, button, [role='button'], [role='tab'], input, select, textarea, [data-tilt], .interactive, .cursor-pointer",
        ),
      );

      if (isInteractive) {
        ring.classList.add("active");
      } else {
        ring.classList.remove("active");
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter);
    document.addEventListener("mouseover", handleMouseOver, { passive: true });

    // Smooth lerp loop for outer ring
    const renderLoop = () => {
      // 0.16 lerp factor gives silky spring motion without lagging too far
      ringPos.current.x += (mousePos.current.x - ringPos.current.x) * 0.16;
      ringPos.current.y += (mousePos.current.y - ringPos.current.y) * 0.16;

      ring.style.transform = `translate(${ringPos.current.x}px, ${ringPos.current.y}px)`;
      animFrameId.current = requestAnimationFrame(renderLoop);
    };

    animFrameId.current = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("mouseover", handleMouseOver);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        className="custom-cursor-dot opacity-0 pointer-events-none"
        aria-hidden="true"
      />
      <div
        ref={ringRef}
        className="custom-cursor-ring opacity-0 pointer-events-none"
        aria-hidden="true"
      />
    </>
  );
}
