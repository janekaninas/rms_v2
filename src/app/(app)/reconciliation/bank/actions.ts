"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettlementBatchDetail, type SettlementBatchDetail } from "@/lib/settlement/reconciliation";
import {
  loadAllocatedTransactionsForBatch,
  loadTransactionDetail,
  type BankTransactionDetail,
} from "@/lib/bank/reconciliation";
import { suggestCandidatesForTransaction, type CandidateBatch, type BankMatchSuggestion } from "@/lib/bank/matching";
import { confirmBankAllocation } from "@/lib/bank/allocate";
import { autoResolveExactMatches } from "@/lib/bank/auto-resolve";
import type { BankMatchMethod } from "@/lib/types";

export interface BatchBankDrilldown {
  batch: SettlementBatchDetail | null;
  allocatedTransactions: Awaited<ReturnType<typeof loadAllocatedTransactionsForBatch>>;
}

export async function getBatchBankDrilldown(batchId: string): Promise<BatchBankDrilldown> {
  const supabase = await createClient();
  const [batch, allocatedTransactions] = await Promise.all([
    loadSettlementBatchDetail(supabase, batchId),
    loadAllocatedTransactionsForBatch(supabase, batchId),
  ]);
  return { batch, allocatedTransactions };
}

export interface OrphanTransactionDrilldown {
  transaction: BankTransactionDetail | null;
  suggestions: BankMatchSuggestion[];
}

export async function getOrphanTransactionDrilldown(transactionId: string): Promise<OrphanTransactionDrilldown> {
  const supabase = await createClient();
  const transaction = await loadTransactionDetail(supabase, transactionId);
  if (!transaction) return { transaction: null, suggestions: [] };

  // Recompute against every batch not yet fully allocated — same live,
  // never-cached derivation the page itself uses (REPORTING_LOGIC.md §11).
  const { data: batchRows } = await supabase
    .from("ota_settlement_batches")
    .select("id, channel_id, batch_reference, batch_date, net_settlement_amount");
  const { data: channelRows } = await supabase.from("channels").select("id, display_name");
  const channelNameById = new Map((channelRows ?? []).map((c) => [c.id as string, c.display_name as string]));
  const { data: allocationRows } = await supabase
    .from("settlement_bank_allocations")
    .select("settlement_batch_id, allocated_amount")
    .not("confirmed_at", "is", null);
  const allocatedByBatch = new Map<string, number>();
  for (const a of allocationRows ?? []) {
    if (!a.settlement_batch_id) continue;
    allocatedByBatch.set(
      a.settlement_batch_id as string,
      (allocatedByBatch.get(a.settlement_batch_id as string) ?? 0) + (a.allocated_amount as number),
    );
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

  const suggestions = suggestCandidatesForTransaction(
    { date: transaction.transactionDate, amount: transaction.amount, description: transaction.description, reference: null },
    candidates,
  );

  return { transaction, suggestions };
}

export async function confirmMatchAction(input: {
  bankTransactionId: string;
  settlementBatchId: string;
  allocatedAmount: number;
  matchMethod: BankMatchMethod;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await confirmBankAllocation(supabase, {
    ...input,
    confirmedBy: user?.id ?? null,
  });

  revalidatePath("/reconciliation/bank");
}

/**
 * Manual "re-check now" sweep for the exact-reference-and-amount tier —
 * mainly a backfill for data imported before the embedded-reference
 * detection existed (new imports already auto-resolve this at commit
 * time, src/lib/bank/commit.ts and src/lib/settlement/commit.ts). Never
 * touches anything short of that same unambiguous tier — this button
 * cannot create a match the system wouldn't already auto-confirm on its
 * own for new data.
 */
export async function runAutoResolveAction(): Promise<{ resolvedCount: number }> {
  const supabase = await createClient();
  const result = await autoResolveExactMatches(supabase);
  revalidatePath("/reconciliation/bank");
  return result;
}
