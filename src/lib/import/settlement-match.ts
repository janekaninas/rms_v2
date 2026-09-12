export function normalizeSettlementRef(ref: string): string {
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface ReservationCandidate {
  id: string;
  reservation_number: string;
  /** The OTA's own booking reference (VHP's Voucher No/Voucher column) — confirmed against real data that this, not reservation_number, is what an OTA settlement file's own reference column actually matches. Null when never captured (e.g. a reservation seeded only by Baseline import, before this field existed). */
  voucher_number?: string | null;
}

/**
 * Shared by both the preview step (resolve-settlement.ts) and the commit
 * step (commit-settlement.ts) so the two can never disagree about which
 * reservation a settlement line matches — exactly the same lookup, run
 * twice against what should be the same underlying data. Tries an exact
 * (case-insensitive) match first; falls back to a punctuation/whitespace-
 * stripped comparison, since an OTA's own reference format may carry a
 * prefix/suffix VHP's reservation_number doesn't (IMPORT_LOGIC.md §8) —
 * never force-picks among multiple candidates either way.
 */
export function matchSettlementReservation(
  rawRef: string,
  exactByNumber: Map<string, ReservationCandidate[]>,
  normalizedByNumber: Map<string, ReservationCandidate[]>,
): { outcome: "MATCHED" | "AMBIGUOUS" | "UNMATCHED"; candidates: ReservationCandidate[] } {
  const exact = exactByNumber.get(rawRef.toUpperCase());
  const candidates = exact && exact.length > 0 ? exact : normalizedByNumber.get(normalizeSettlementRef(rawRef)) ?? [];

  if (candidates.length === 0) return { outcome: "UNMATCHED", candidates };
  if (candidates.length === 1) return { outcome: "MATCHED", candidates };
  return { outcome: "AMBIGUOUS", candidates };
}

/** Adds one reservation under one key to both lookup maps, without duplicating the same reservation twice under the same key (a reservation whose reservation_number and voucher_number happen to normalize identically shouldn't count as two candidates for itself). */
function indexReservation(
  exactByNumber: Map<string, ReservationCandidate[]>,
  normalizedByNumber: Map<string, ReservationCandidate[]>,
  key: string,
  r: ReservationCandidate,
) {
  const exactKey = key.toUpperCase();
  const exactList = exactByNumber.get(exactKey) ?? [];
  if (!exactList.some((c) => c.id === r.id)) exactByNumber.set(exactKey, [...exactList, r]);

  const normKey = normalizeSettlementRef(key);
  const normList = normalizedByNumber.get(normKey) ?? [];
  if (!normList.some((c) => c.id === r.id)) normalizedByNumber.set(normKey, [...normList, r]);
}

/**
 * Indexes every reservation under BOTH its own reservation_number and its
 * voucher_number (when captured) — an OTA settlement line's reference can
 * match either, and matchSettlementReservation's own AMBIGUOUS handling
 * already protects against the (extremely unlikely) case where two
 * different reservations' numbers collide across the two key spaces:
 * that surfaces as AMBIGUOUS, never a silent wrong pick.
 */
export function buildReservationLookup(reservations: ReservationCandidate[]): {
  exactByNumber: Map<string, ReservationCandidate[]>;
  normalizedByNumber: Map<string, ReservationCandidate[]>;
} {
  const exactByNumber = new Map<string, ReservationCandidate[]>();
  const normalizedByNumber = new Map<string, ReservationCandidate[]>();
  for (const r of reservations) {
    indexReservation(exactByNumber, normalizedByNumber, r.reservation_number, r);
    if (r.voucher_number) indexReservation(exactByNumber, normalizedByNumber, r.voucher_number, r);
  }
  return { exactByNumber, normalizedByNumber };
}
