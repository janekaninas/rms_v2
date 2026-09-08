import type { SettlementDateFormat } from "@/lib/types";

// Common abbreviations and full names observed across real exports —
// Booking.com's confirmed sample uses both "Aug" (3-letter) and "Sept"
// (4-letter) in the same file, so both must resolve.
const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Explicit per-mapping date format (`SettlementColumnMapping.dateFormat`)
 * — never auto-detected, since MM/DD/YYYY and DD/MM/YYYY are genuinely
 * ambiguous for any day <= 12 and guessing wrong would silently
 * misattribute a batch to the wrong date. Returns null (never a guessed
 * date) for anything that doesn't match the selected format exactly.
 */
export function parseSettlementDate(raw: string | undefined | null, format: SettlementDateFormat): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim().replace(/^"|"$/g, "");
  if (trimmed === "") return null;

  if (format === "YYYY-MM-DD") {
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  }

  if (format === "DD/MM/YYYY") {
    const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  if (format === "MM/DD/YYYY") {
    const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  if (format === "D_MMM_YYYY") {
    // Space-separated ("31 Aug 2026", confirmed on Booking.com) and
    // hyphen-separated ("6-Jul-2026", confirmed on Trip.com) both occur
    // in real exports of this same day-month-year shape.
    const m = trimmed.match(/^(\d{1,2})[\s-]+([A-Za-z]+)\.?[\s-]+(\d{4})$/);
    if (!m) return null;
    const [, d, monRaw, y] = m;
    const month = MONTHS[monRaw.toLowerCase()];
    if (!month) return null;
    return `${y}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  if (format === "MMM_D_YYYY") {
    // e.g. "Sep 1, 2026" — confirmed on a second real Booking.com export
    // (its first confirmed sample instead used D_MMM_YYYY, "1 Sept 2026" —
    // Booking.com's own date convention isn't consistent across exports).
    const m = trimmed.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    if (!m) return null;
    const [, monRaw, d, y] = m;
    const month = MONTHS[monRaw.toLowerCase()];
    if (!month) return null;
    return `${y}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

/** Adds `days` calendar days to an ISO `YYYY-MM-DD` date. Used for a
 * channel with no exported payout date at all (e.g. Agoda, confirmed by
 * Jane: claimable 30 days after the stay's check-out date). */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
