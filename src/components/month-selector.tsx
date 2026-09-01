"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel, shiftMonth } from "@/lib/reporting/period";

/**
 * REPORTING_LOGIC.md §2's suggested `< July 2026 | August 2026 | September
 * 2026 >` control — one shared component so Monthly Performance, Summary,
 * and Road to Target don't each reimplement month navigation.
 */
export function MonthSelector({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(y: number, m: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(y));
    params.set("month", String(m));
    router.push(`${pathname}?${params.toString()}`);
  }

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  return (
    <div className="flex items-center gap-1 rounded-md border bg-card px-1 py-1">
      <Button variant="ghost" size="icon-sm" onClick={() => go(prev.year, prev.month)} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium">{monthLabel(year, month)}</span>
      <Button variant="ghost" size="icon-sm" onClick={() => go(next.year, next.month)} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
