import type { BankReconciliationStatus } from "@/lib/types";

/**
 * REPORTING_LOGIC.md §11's status derivation for one settlement batch's
 * bank-side state — kept as a pure function so the value computed live on
 * every page load can never structurally drift from what any future
 * "refresh" convenience might store. Default tolerance mirrors Settlement
 * Reconciliation's own zero-tolerance default (`src/lib/settlement/status.ts`).
 */
export function deriveBatchBankStatus(input: {
  netSettlementAmount: number;
  /** Sum of this batch's *confirmed* settlement_bank_allocations. */
  bankReceivedTotal: number;
  toleranceAbs?: number;
}): Extract<BankReconciliationStatus, "AWAITING_BANK" | "MATCHED" | "PARTIAL" | "VARIANCE"> {
  const tolerance = input.toleranceAbs ?? 1;
  if (input.bankReceivedTotal <= tolerance) return "AWAITING_BANK";
  const diff = input.bankReceivedTotal - input.netSettlementAmount;
  if (Math.abs(diff) <= tolerance) return "MATCHED";
  if (diff < 0) return "PARTIAL";
  return "VARIANCE";
}

/** For a bank transaction with no confirmed allocation yet: ambiguous (multiple plausible candidates) surfaces as NEEDS_REVIEW rather than a plain UNMATCHED, so a genuinely confusing case doesn't look identical to "nothing found at all." */
export function deriveUnallocatedTransactionStatus(candidateCount: number): Extract<BankReconciliationStatus, "UNMATCHED" | "NEEDS_REVIEW"> {
  return candidateCount >= 2 ? "NEEDS_REVIEW" : "UNMATCHED";
}
