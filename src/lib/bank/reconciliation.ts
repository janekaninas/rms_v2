import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankReconciliationStatus } from "@/lib/types";
import { loadSettlementBatches } from "../settlement/reconciliation";
import { deriveBatchBankStatus, deriveUnallocatedTransactionStatus } from "./status";
import { suggestCandidatesForTransaction, type CandidateBatch, type BankMatchSuggestion } from "./matching";

export interface BankReconciliationRow {
  key: string;
  channelId: string | null;
  channelName: string | null;
  settlementBatchId: string | null;
  settlementReference: string | null;
  settlementDate: string | null;
  /** Sum of allocated reservations' expected_settlement_amount — null means not yet determined (Settlement Reconciliation's own PENDING/MISSING_PAYMENT_RULE state), not zero. */
  expectedSettlement: number | null;
  otaSettlementAmount: number | null;
  bankReceived: number;
  difference: number | null;
  status: BankReconciliationStatus;
  allocatedTransactionIds: string[];
  /** Set only for an orphan bank transaction row (no settlement batch at all yet). */
  orphanTransactionId: string | null;
}

export interface BankReconciliationFilters {
  bankAccountId?: string;
  channelId?: string;
  fromDate?: string;
  toDate?: string;
  status?: BankReconciliationStatus;
}

/**
 * Builds the Bank Reconciliation page's unified row list (REPORTING_LOGIC.md
 * §11): one row per OTA settlement batch (joined with however much
 * confirmed bank money has been allocated to it — AWAITING_BANK/MATCHED/
 * PARTIAL/VARIANCE), plus one row per bank credit transaction that has no
 * confirmed allocation at all yet (UNMATCHED/NEEDS_REVIEW), each carrying
 * its own live-computed candidate suggestions. Reuses `loadSettlementBatches`
 * (Day 5) rather than re-deriving Expected/OTA Settlement/Variance —
 * REPORTING_LOGIC.md §11 is explicitly "Distinct from Settlement
 * Reconciliation, which only asks whether the OTA's own report matches
 * expectations," not a re-implementation of it.
 */
export async function loadBankReconciliationRows(
  supabase: SupabaseClient,
  filters: BankReconciliationFilters = {},
): Promise<{ rows: BankReconciliationRow[]; suggestionsByOrphanTxn: Map<string, BankMatchSuggestion[]> }> {
  const batches = await loadSettlementBatches(supabase, { channelId: filters.channelId });

  const { data: allocationRows } = await supabase
    .from("settlement_bank_allocations")
    .select("bank_transaction_id, settlement_batch_id, allocated_amount, confirmed_at")
    .not("confirmed_at", "is", null);
  const confirmedAllocations = allocationRows ?? [];

  const allocatedByBatch = new Map<string, { total: number; transactionIds: string[] }>();
  const allocatedTransactionIds = new Set<string>();
  for (const a of confirmedAllocations) {
    allocatedTransactionIds.add(a.bank_transaction_id as string);
    if (!a.settlement_batch_id) continue;
    const entry = allocatedByBatch.get(a.settlement_batch_id as string) ?? { total: 0, transactionIds: [] };
    entry.total += a.allocated_amount as number;
    entry.transactionIds.push(a.bank_transaction_id as string);
    allocatedByBatch.set(a.settlement_batch_id as string, entry);
  }

  let txnQuery = supabase
    .from("bank_transactions")
    .select("id, bank_account_id, transaction_date, description, reference, amount")
    .gt("amount", 0) // OTA payouts are always credits — debits are unrelated banking activity, out of Day-6 reconciliation scope
    .order("transaction_date", { ascending: false });
  if (filters.bankAccountId) txnQuery = txnQuery.eq("bank_account_id", filters.bankAccountId);
  if (filters.fromDate) txnQuery = txnQuery.gte("transaction_date", filters.fromDate);
  if (filters.toDate) txnQuery = txnQuery.lte("transaction_date", filters.toDate);
  const { data: txnRows } = await txnQuery;
  const allCreditTransactions = txnRows ?? [];
  const orphanTransactions = allCreditTransactions.filter((t) => !allocatedTransactionIds.has(t.id as string));

  const candidateBatches: CandidateBatch[] = batches.map((b) => ({
    id: b.id,
    channelId: b.channelId,
    channelName: b.channelName,
    batchReference: b.batchReference,
    batchDate: b.batchDate,
    netSettlementAmount: b.netSettlementAmount,
    alreadyAllocated: allocatedByBatch.get(b.id)?.total ?? 0,
  }));

  const rows: BankReconciliationRow[] = [];

  for (const b of batches) {
    const allocated = allocatedByBatch.get(b.id);
    const bankReceived = allocated?.total ?? 0;
    const status = deriveBatchBankStatus({ netSettlementAmount: b.netSettlementAmount, bankReceivedTotal: bankReceived });
    rows.push({
      key: b.id,
      channelId: b.channelId,
      channelName: b.channelName,
      settlementBatchId: b.id,
      settlementReference: b.batchReference,
      settlementDate: b.batchDate,
      expectedSettlement: b.expectedTotal,
      otaSettlementAmount: b.netSettlementAmount,
      bankReceived,
      difference: bankReceived - b.netSettlementAmount,
      status,
      allocatedTransactionIds: allocated?.transactionIds ?? [],
      orphanTransactionId: null,
    });
  }

  const suggestionsByOrphanTxn = new Map<string, BankMatchSuggestion[]>();
  for (const t of orphanTransactions) {
    const suggestions = suggestCandidatesForTransaction(
      {
        date: t.transaction_date as string,
        amount: t.amount as number,
        description: t.description as string,
        reference: t.reference as string | null,
      },
      candidateBatches,
    );
    suggestionsByOrphanTxn.set(t.id as string, suggestions);
    const highConfidenceCount = suggestions.filter((s) => s.confidence >= 0.7).length;
    rows.push({
      key: `txn:${t.id}`,
      channelId: null,
      channelName: suggestions[0]?.channelName ?? null,
      settlementBatchId: null,
      settlementReference: null,
      settlementDate: null,
      expectedSettlement: null,
      otaSettlementAmount: null,
      bankReceived: t.amount as number,
      difference: null,
      status: deriveUnallocatedTransactionStatus(highConfidenceCount),
      allocatedTransactionIds: [],
      orphanTransactionId: t.id as string,
    });
  }

  const filtered = filters.status ? rows.filter((r) => r.status === filters.status) : rows;
  return { rows: filtered, suggestionsByOrphanTxn };
}

export interface BankTransactionDetail {
  id: string;
  bankAccountName: string;
  transactionDate: string;
  description: string;
  amount: number;
  runningBalance: number | null;
}

export async function loadTransactionDetail(supabase: SupabaseClient, transactionId: string): Promise<BankTransactionDetail | null> {
  const { data: t } = await supabase
    .from("bank_transactions")
    .select("id, bank_account_id, transaction_date, description, amount, running_balance")
    .eq("id", transactionId)
    .maybeSingle();
  if (!t) return null;
  const { data: acct } = await supabase.from("bank_accounts").select("account_name").eq("id", t.bank_account_id as string).maybeSingle();
  return {
    id: t.id as string,
    bankAccountName: (acct?.account_name as string | undefined) ?? "—",
    transactionDate: t.transaction_date as string,
    description: t.description as string,
    amount: t.amount as number,
    runningBalance: t.running_balance as number | null,
  };
}

/** Every batch-linked bank transaction for one batch, for the drill-down. */
export async function loadAllocatedTransactionsForBatch(supabase: SupabaseClient, batchId: string) {
  const { data: allocRows } = await supabase
    .from("settlement_bank_allocations")
    .select("bank_transaction_id, allocated_amount, match_method, confirmed_at")
    .eq("settlement_batch_id", batchId)
    .not("confirmed_at", "is", null);
  const allocations = allocRows ?? [];
  const txnIds = allocations.map((a) => a.bank_transaction_id as string);
  const { data: txnRows } = await supabase
    .from("bank_transactions")
    .select("id, transaction_date, description, amount")
    .in("id", txnIds.length > 0 ? txnIds : ["00000000-0000-0000-0000-000000000000"]);
  const txnById = new Map((txnRows ?? []).map((t) => [t.id as string, t]));
  return allocations.map((a) => {
    const t = txnById.get(a.bank_transaction_id as string);
    return {
      transactionId: a.bank_transaction_id as string,
      transactionDate: (t?.transaction_date as string) ?? "—",
      description: (t?.description as string) ?? "—",
      allocatedAmount: a.allocated_amount as number,
      matchMethod: a.match_method as string,
    };
  });
}
