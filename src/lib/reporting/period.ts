import type { SupabaseClient } from "@supabase/supabase-js";
import type { Villa } from "@/lib/types";

export interface MonthRange {
  year: number;
  month: number; // 1-12
  /** Inclusive, YYYY-MM-DD */
  start: string;
  /** Exclusive, YYYY-MM-DD (first day of the following month) */
  endExclusive: string;
  /** Inclusive, YYYY-MM-DD (last calendar day of the month) */
  endInclusive: string;
  daysInMonth: number;
}

export function getMonthRange(year: number, month: number): MonthRange {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endInclusive = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  const endExclusive = nextMonthDate.toISOString().slice(0, 10);
  return { year, month, start, endExclusive, endInclusive, daysInMonth };
}

export function listDatesInMonth(range: MonthRange): string[] {
  const dates: string[] = [];
  for (let d = 1; d <= range.daysInMonth; d++) {
    dates.push(`${range.year}-${String(range.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return dates;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * REPORTING_LOGIC.md §2a: a villa's *current* `active` flag never gates a
 * historical/period report — only management-date-window overlap with the
 * selected period does. Split by portfolio to match the legacy sheet's
 * Aasha/Balinest column grouping.
 */
export async function getVillasForPeriod(
  supabase: SupabaseClient,
  range: MonthRange,
): Promise<{ aasha: Villa[]; balinest: Villa[]; all: Villa[] }> {
  const { data, error } = await supabase
    .from("villas")
    .select("*")
    .lte("management_start_date", range.endInclusive)
    .or(`management_end_date.is.null,management_end_date.gte.${range.start}`)
    .order("villa_code");
  if (error) throw new Error(error.message);

  const all = (data ?? []) as Villa[];
  return {
    aasha: all.filter((v) => v.portfolio === "AASHA"),
    balinest: all.filter((v) => v.portfolio === "BALINEST"),
    all,
  };
}

/**
 * REPORTING_LOGIC.md §2b: days within the selected month that fall inside
 * the villa's own `[management_start_date, management_end_date]` window
 * (both ends inclusive) — never the full month for a villa onboarded or
 * offboarded mid-month.
 */
export function managedDaysInMonth(villa: Villa, range: MonthRange): number {
  const windowStart = villa.management_start_date > range.start ? villa.management_start_date : range.start;
  const windowEnd =
    villa.management_end_date && villa.management_end_date < range.endInclusive
      ? villa.management_end_date
      : range.endInclusive;
  if (windowStart > windowEnd) return 0;
  const startMs = new Date(`${windowStart}T00:00:00Z`).getTime();
  const endMs = new Date(`${windowEnd}T00:00:00Z`).getTime();
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}
