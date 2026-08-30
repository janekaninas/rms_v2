// Parsing helpers grounded in real VHP export samples (docs/IMPORT_LOGIC.md
// §1's note on locale-formatted numbers, confirmed against real files):
// numbers are always comma-thousands/period-decimal regardless of which
// field delimiter a given export uses; dates appear in more than one
// format even within the same report type across different export runs.

/** Strips a UTF-8 BOM if present — every real sample file starts with one. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parses a locale-formatted number like "1,458,022.00" or "  500,000.00".
 * Returns null for blank/unparseable input — never a guessed 0, so a
 * missing amount is visibly missing rather than silently zeroed.
 */
export function parseLocaleNumber(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const cleaned = trimmed.replace(/,/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parses a date in any of the formats observed in real exports:
 * YYYY-MM-DD, DD/MM/YY, or DD/MM/YYYY. Returns an ISO YYYY-MM-DD string,
 * or null if unparseable — never a guessed date.
 */
export function parseFlexibleDate(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const shortYearMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (shortYearMatch) {
    const [, dd, mm, yy] = shortYearMatch;
    return `20${yy}-${mm}-${dd}`;
  }

  const longYearMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (longYearMatch) {
    const [, dd, mm, yyyy] = longYearMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

/** Trims and collapses internal whitespace — real exports have stray padding. */
export function cleanText(raw: string | undefined | null): string {
  if (raw === undefined || raw === null) return "";
  return raw.trim().replace(/\s+/g, " ");
}
