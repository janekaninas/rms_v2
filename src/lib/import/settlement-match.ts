export function normalizeSettlementRef(ref: string): string {
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface ReservationCandidate {
  id: string;
  reservation_number: string;
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

export function buildReservationLookup(reservations: ReservationCandidate[]): {
  exactByNumber: Map<string, ReservationCandidate[]>;
  normalizedByNumber: Map<string, ReservationCandidate[]>;
} {
  const exactByNumber = new Map<string, ReservationCandidate[]>();
  const normalizedByNumber = new Map<string, ReservationCandidate[]>();
  for (const r of reservations) {
    const exactKey = r.reservation_number.toUpperCase();
    exactByNumber.set(exactKey, [...(exactByNumber.get(exactKey) ?? []), r]);
    const normKey = normalizeSettlementRef(r.reservation_number);
    normalizedByNumber.set(normKey, [...(normalizedByNumber.get(normKey) ?? []), r]);
  }
  return { exactByNumber, normalizedByNumber };
}
