"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * REPORTING_LOGIC.md §2a: occupancy and revenue are shown as two separate
 * matrices (the legacy sheet's two stacked sheets), toggled here rather
 * than combined into one denser but harder-to-scan cell.
 */
export function ViewToggle({ view }: { view: "occupancy" | "revenue" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setView(next: "occupancy" | "revenue") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex rounded-md border bg-card p-0.5">
      {(["occupancy", "revenue"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={cn(
            "rounded px-3 py-1 text-sm capitalize transition-colors",
            view === v ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-muted-foreground hover:bg-sidebar-accent",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
