import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankMutationAccountSection } from "./bank-mutation-docx";
import { transactionDedupeHash } from "./bank-mutation-hash";

export interface BankMutationPreviewRow {
  transactionDate: string;
  description: string;
  /** Signed — positive for CR, negative for DB. */
  amount: number;
  debit: number | null;
  credit: number | null;
  runningBalance: number | null;
  dedupeHash: string;
  alreadyImported: boolean;
}

export interface BankMutationSectionPreview {
  accountNumber: string;
  accountName: string;
  /** Null when no `bank_accounts` row matches this account number — this section's rows are never committed, only surfaced. */
  bankAccountId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  rows: BankMutationPreviewRow[];
  /** Rows shown in the raw file as "PEND" (not yet posted, no date) — never committed; they reappear correctly dated on a later statement. */
  pendingSkippedCount: number;
  declaredCreditTotal: number | null;
  declaredDebitTotal: number | null;
  /** Includes pending rows, since BCA's own declared totals do too — see bank-mutation-docx.ts. */
  parsedCreditTotal: number;
  parsedDebitTotal: number;
  totalMismatch: boolean;
}

export interface BankMutationImportPreview {
  fileName: string;
  sections: BankMutationSectionPreview[];
}

const TOLERANCE = 1;

/**
 * Turns parsed BCA statement sections into a commit-ready preview: resolves
 * each section to a configured `bank_accounts` row (never guessed — an
 * unrecognized account number's rows are surfaced, not imported, per
 * CLAUDE.md rule 8), computes each row's idempotency hash and checks it
 * against already-committed transactions, and cross-checks the statement's
 * own declared credit/debit totals against the parsed rows (declared vs.
 * summed, surfaced not silently overridden — the same pattern already used
 * for Airbnb's settlement batches, IMPORT_LOGIC.md §8).
 */
export async function resolveBankMutationImport(
  supabase: SupabaseClient,
  sections: BankMutationAccountSection[],
  _fileName: string,
): Promise<BankMutationImportPreview> {
  const { data: accountRows } = await supabase.from("bank_accounts").select("id, account_number_masked");
  const accountIdByNumber = new Map(
    (accountRows ?? []).map((a) => [a.account_number_masked as string, a.id as string]),
  );

  const sectionPreviews: BankMutationSectionPreview[] = [];

  for (const section of sections) {
    const bankAccountId = accountIdByNumber.get(section.accountNumber) ?? null;

    let existingHashes = new Set<string>();
    if (bankAccountId) {
      const { data: existingRows } = await supabase
        .from("bank_transactions")
        .select("dedupe_hash")
        .eq("bank_account_id", bankAccountId);
      existingHashes = new Set((existingRows ?? []).map((r) => r.dedupe_hash as string));
    }

    const rows: BankMutationPreviewRow[] = [];
    let parsedCreditTotal = 0;
    let parsedDebitTotal = 0;

    for (const r of section.rows) {
      if (r.direction === "CR") parsedCreditTotal += r.amount;
      else parsedDebitTotal += r.amount;

      if (r.isPending || !r.transactionDate) continue; // never committed — see bank-mutation-docx.ts

      const signedAmount = r.direction === "CR" ? r.amount : -r.amount;
      const hash = bankAccountId
        ? transactionDedupeHash(bankAccountId, r.transactionDate, signedAmount, r.description, r.runningBalance)
        : "";

      rows.push({
        transactionDate: r.transactionDate,
        description: r.description,
        amount: signedAmount,
        debit: r.direction === "DB" ? r.amount : null,
        credit: r.direction === "CR" ? r.amount : null,
        runningBalance: r.runningBalance,
        dedupeHash: hash,
        alreadyImported: bankAccountId ? existingHashes.has(hash) : false,
      });
    }

    const creditMismatch =
      section.declaredCreditTotal !== null && Math.abs(section.declaredCreditTotal - parsedCreditTotal) > TOLERANCE;
    const debitMismatch =
      section.declaredDebitTotal !== null && Math.abs(section.declaredDebitTotal - parsedDebitTotal) > TOLERANCE;

    sectionPreviews.push({
      accountNumber: section.accountNumber,
      accountName: section.accountName,
      bankAccountId,
      periodStart: section.periodStart,
      periodEnd: section.periodEnd,
      rows,
      pendingSkippedCount: section.pendingCount,
      declaredCreditTotal: section.declaredCreditTotal,
      declaredDebitTotal: section.declaredDebitTotal,
      parsedCreditTotal,
      parsedDebitTotal,
      totalMismatch: creditMismatch || debitMismatch,
    });
  }

  return { fileName: _fileName, sections: sectionPreviews };
}
