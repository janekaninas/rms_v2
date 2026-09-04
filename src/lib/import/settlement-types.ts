import type { SettlementLineType } from "@/lib/types";

export interface NormalizedSettlementLine {
  sourceRowNumber: number;
  batchReference: string | null;
  batchDate: string | null;
  lineType: SettlementLineType;
  rawReservationReference: string | null;
  amount: number | null;
  description: string | null;
  externalLineRef: string | null;
  /** Preserved-for-drill-down columns (Booking.com's Commission/VAT/etc, Airbnb's Service fee/Nights/Listing/etc) — display only, never used in any calculation. */
  extraFields: Record<string, string> | null;
  errors: string[];
}

export type SettlementMatchOutcome = "MATCHED" | "AMBIGUOUS" | "UNMATCHED" | "NOT_APPLICABLE";

export interface ResolvedSettlementLine {
  line: NormalizedSettlementLine;
  matchOutcome: SettlementMatchOutcome;
  matchedReservationId: string | null;
  matchedReservationNumber: string | null;
  matchCandidateCount: number;
}

export interface SettlementBatchPreview {
  batchReference: string | null;
  batchDate: string;
  lines: ResolvedSettlementLine[];
  grossAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  isDuplicateOfExistingBatch: boolean;
  /**
   * Hierarchical mode only (e.g. Airbnb's Payout row "Paid out"): the
   * batch's own declared total, kept distinct from `netAmount` (which is
   * this same value once resolved, or the summed reservation lines if the
   * Payout row's total was itself unparseable) so a genuine mismatch
   * between "what the Payout row says it paid" and "what the reservation
   * lines sum to" is visible rather than silently absorbed into a
   * generic Adjustment figure. Null for flat-mode batches (Booking.com),
   * which have no separate declared-total row to validate against.
   */
  declaredTotal: number | null;
  /** True when `declaredTotal` and the sum of reservation-line amounts disagree beyond rounding. */
  totalMismatch: boolean;
  /** Rows that couldn't be attributed to any batch (e.g. a Reservation row before the first Payout row) — surfaced, never silently dropped. */
  unassignedErrors: string[];
}

export interface SettlementImportPreview {
  channelId: string;
  fileName: string;
  totalRows: number;
  counts: {
    matched: number;
    unmatched: number;
    ambiguous: number;
    errors: number;
  };
  batches: SettlementBatchPreview[];
}

/** Shared by both the parsed-file commit path and manual entry — the data
 * model and reconciliation behavior are identical either way
 * (IMPORT_LOGIC.md §8 pt.7); only how a draft is constructed differs. */
export interface SettlementLineDraft {
  lineType: SettlementLineType;
  rawReservationReference: string | null;
  amount: number;
  description: string | null;
  externalLineRef: string | null;
  extraFields: Record<string, string> | null;
}

export interface SettlementBatchDraft {
  channelId: string;
  batchReference: string | null;
  batchDate: string;
  lines: SettlementLineDraft[];
  /**
   * The batch's authoritative net settlement amount when the source
   * already declares one (e.g. Airbnb's Payout row "Paid out" — kept
   * even when it doesn't exactly match the sum of this batch's lines,
   * since the declared figure is what actually hit the bank, not the
   * line-level detail). When omitted (manual entry has no separate
   * declared total), the commit step sums the lines instead.
   */
  declaredNetAmount?: number | null;
}
