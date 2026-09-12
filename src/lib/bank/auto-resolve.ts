import type { SupabaseClient } from "@supabase/supabase-js";
import { suggestCandidatesForTransaction, type CandidateBatch } from "./matching";
import { confirmBankAllocation } from "./allocate";

/**
 * Auto-resolves every currently-unallocated bank credit transaction that
 * has exactly one unambiguous exact-reference-and-amount candidate
 * (REPORTING_LOGIC.md §11's only auto-resolve tier) — never a lone
 * exact-amount match, never a channel/date-proximity guess. `confirmed_by`
 * is left null for these (DATA_MODEL.md §6: required only outside the
 * unambiguous tier), so they remain visibly distinguishable from a human
 * confirmation while still being a real, non-reversible-by-accident match.
 *
 * Called after every bank-mutation and settlement commit (new data on
 * either side can newly complete a pair), and also exposed as a manual
 * "re-check now" action so already-committed data — imported before this
 * logic existed — can be swept once rather than requiring a one-by-one
 * manual click for every already-unambiguous case.
 */
export async function autoResolveExactMatches(supabase: SupabaseClient): Promise<{ resolvedCount: number }> {
  const { data: batchRows } = await supabase
    .from("ota_settlement_batches")
    .select("id, channel_id, batch_reference, batch_date, net_settlement_amount");
  const { data: channelRows } = await supabase.from("channels").select("id, display_name");
  const channelNameById = new Map((channelRows ?? []).map((c) => [c.id as string, c.display_name as string]));

  const { data: allocationRows } = await supabase
    .from("settlement_bank_allocations")
    .select("bank_transaction_id, settlement_batch_id, allocated_amount")
    .not("confirmed_at", "is", null);
  const allocations = allocationRows ?? [];
  const allocatedTransactionIds = new Set(allocations.map((a) => a.bank_transaction_id as string));
  const allocatedByBatch = new Map<string, number>();
  for (const a of allocations) {
    if (!a.settlement_batch_id) continue;
    allocatedByBatch.set(a.settlement_batch_id as string, (allocatedByBatch.get(a.settlement_batch_id as string) ?? 0) + (a.allocated_amount as number));
  }

  const candidates: CandidateBatch[] = (batchRows ?? []).map((b) => ({
    id: b.id as string,
    channelId: b.channel_id as string,
    channelName: channelNameById.get(b.channel_id as string) ?? "—",
    batchReference: b.batch_reference as string | null,
    batchDate: b.batch_date as string,
    netSettlementAmount: b.net_settlement_amount as number,
    alreadyAllocated: allocatedByBatch.get(b.id as string) ?? 0,
  }));

  const { data: txnRows } = await supabase
    .from("bank_transactions")
    .select("id, transaction_date, description, reference, amount")
    .gt("amount", 0);
  const orphanTransactions = (txnRows ?? []).filter((t) => !allocatedTransactionIds.has(t.id as string));

  let resolvedCount = 0;
  for (const t of orphanTransactions) {
    const suggestions = suggestCandidatesForTransaction(
      {
        date: t.transaction_date as string,
        amount: t.amount as number,
        description: t.description as string,
        reference: t.reference as string | null,
      },
      candidates,
    );
    const autoResolvable = suggestions.filter((s) => s.autoResolvable);
    if (autoResolvable.length !== 1) continue; // no match, or genuinely ambiguous — never guess

    const winner = autoResolvable[0];
    await confirmBankAllocation(supabase, {
      bankTransactionId: t.id as string,
      settlementBatchId: winner.settlementBatchId,
      allocatedAmount: t.amount as number,
      matchMethod: "REFERENCE_MATCH",
      confirmedBy: null,
    });
    // Keep this run's own view consistent so a later transaction in the
    // same pass can't also claim an already-just-spent batch.
    const c = candidates.find((c) => c.id === winner.settlementBatchId);
    if (c) c.alreadyAllocated += t.amount as number;
    resolvedCount++;
  }

  return { resolvedCount };
}
