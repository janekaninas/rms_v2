import type { SettlementBatchStatus } from "@/lib/types";

/**
 * REPORTING_LOGIC.md §10's status derivation, kept as one pure function so
 * it never drifts between the value stored on commit (for fast list
 * filtering) and the live figure the Settlement Reconciliation page
 * actually displays (recomputed from current source data, since a
 * reservation's `expected_settlement_amount` can change after the batch
 * was committed — e.g. a MISSING_PAYMENT_RULE gets configured later).
 *
 * Default tolerance is effectively zero (sub-cent rounding only) per the
 * confirmed rule: "a configurable small tolerance ... not a business rule
 * to invent freely; default zero-tolerance until Jane says otherwise."
 */
export function deriveBatchStatus(input: {
  /** BOOKING_PAYOUT lines that carry a reservation reference but have no allocation yet (UNMATCHED or ambiguous/multi-candidate). */
  unresolvedLineCount: number;
  hasAnyAllocation: boolean;
  /** Sum of allocated reservations' expected_settlement_amount; null if any allocated reservation's is null (MISSING_PAYMENT_RULE). */
  expectedTotal: number | null;
  netSettlementAmount: number;
  toleranceAbs?: number;
}): SettlementBatchStatus {
  const tolerance = input.toleranceAbs ?? 1;

  if (!input.hasAnyAllocation) return "PENDING";
  if (input.unresolvedLineCount > 0) return "PARTIALLY_SETTLED";
  if (input.expectedTotal === null) return "NEEDS_REVIEW";

  const variance = Math.abs(input.expectedTotal - input.netSettlementAmount);
  return variance <= tolerance ? "SETTLED" : "VARIANCE";
}
