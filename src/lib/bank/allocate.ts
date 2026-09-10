import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankMatchMethod } from "@/lib/types";

/**
 * Confirms one bank transaction <-> settlement batch match
 * (REPORTING_LOGIC.md §11) — the only way a `settlement_bank_allocations`
 * row is ever created for anything short of the unambiguous
 * exact-reference-and-amount tier, which this same function also serves
 * (called with `confirmedBy: null` in that case, per DATA_MODEL.md §6:
 * confirmed_by/confirmed_at are only *required* — not forbidden — outside
 * that tier). Never silently committed from a page load; always an
 * explicit call.
 */
export async function confirmBankAllocation(
  supabase: SupabaseClient,
  input: {
    bankTransactionId: string;
    settlementBatchId: string;
    allocatedAmount: number;
    matchMethod: BankMatchMethod;
    confirmedBy: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("settlement_bank_allocations").insert({
    bank_transaction_id: input.bankTransactionId,
    settlement_batch_id: input.settlementBatchId,
    allocated_amount: input.allocatedAmount,
    match_method: input.matchMethod,
    confirmed_by: input.confirmedBy,
    confirmed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Failed to confirm bank allocation: ${error.message}`);

  await supabase.from("bank_transactions").update({ reconciliation_status: "MATCHED" }).eq("id", input.bankTransactionId);
}
