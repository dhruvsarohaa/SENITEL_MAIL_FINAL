import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "relative inline-flex h-8 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm opacity-50",
          className,
        )}
      >
        <div className="absolute left-1 flex size-6 items-center justify-center rounded-full bg-background shadow-sm">
          <Moon className="size-3.5 text-primary" strokeWidth={2.5} />
        </div>
      </div>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle theme"
    >
      <div
        className={cn(
          "absolute left-1 flex size-6 items-center justify-center rounded-full bg-background shadow-sm transition-transform duration-300",
          isDark ? "translate-x-6" : "translate-x-0",
        )}
      >
        {isDark ? (
          <Moon className="size-3.5 text-primary" strokeWidth={2.5} />
        ) : (
          <Sun className="size-3.5 text-primary" strokeWidth={2.5} />
        )}
      </div>
    </button>
  );
}
