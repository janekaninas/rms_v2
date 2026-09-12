import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankMutationImportPreview } from "../import/resolve-bank-mutation";
import { autoResolveExactMatches } from "./auto-resolve";

export interface BankMutationCommitResult {
  insertedCount: number;
  skippedAlreadyImportedCount: number;
  skippedUnrecognizedAccountCount: number;
  autoResolvedCount: number;
}

/**
 * Commits a previewed BCA statement import: one `imports` row, one
 * `bank_imports` row per recognized account section actually containing
 * new rows, and bulk-inserted `bank_transactions` — idempotent by
 * construction (IMPORT_LOGIC.md §9 mandatory idempotency), since every row
 * was already checked against existing dedupe hashes at preview time and
 * an `alreadyImported` row is simply not re-sent here. A section with no
 * matching `bank_accounts` row is never committed — surfaced in the result
 * counts instead of guessed or silently dropped (CLAUDE.md rule 8).
 */
export async function commitBankMutationImport(
  supabase: SupabaseClient,
  fileName: string,
  preview: BankMutationImportPreview,
): Promise<BankMutationCommitResult> {
  const totalRows = preview.sections.reduce((sum, s) => sum + s.rows.length, 0);
  let skippedUnrecognizedAccountCount = 0;
  let skippedAlreadyImportedCount = 0;
  let insertedCount = 0;

  const { data: importRow, error: importError } = await supabase
    .from("imports")
    .insert({
      import_type: "BANK_MUTATION",
      filename: fileName,
      row_count: totalRows,
      new_count: 0,
      unmatched_count: 0,
      error_count: 0,
      status: "PENDING_REVIEW",
    })
    .select("id")
    .single();
  if (importError) throw new Error(`Failed to record import summary: ${importError.message}`);

  try {
    for (const section of preview.sections) {
      if (!section.bankAccountId) {
        skippedUnrecognizedAccountCount += section.rows.length;
        continue;
      }

      const newRows = section.rows.filter((r) => !r.alreadyImported);
      skippedAlreadyImportedCount += section.rows.length - newRows.length;

      if (newRows.length > 0) {
        const { error } = await supabase.from("bank_transactions").insert(
          newRows.map((r) => ({
            bank_account_id: section.bankAccountId,
            transaction_date: r.transactionDate,
            description: r.description,
            debit: r.debit,
            credit: r.credit,
            amount: r.amount,
            running_balance: r.runningBalance,
            source_import_id: importRow.id as string,
            dedupe_hash: r.dedupeHash,
          })),
        );
        if (error) throw new Error(`Failed to create bank transactions: ${error.message}`);
        insertedCount += newRows.length;
      }

      if (section.periodStart && section.periodEnd) {
        await supabase.from("bank_imports").insert({
          bank_account_id: section.bankAccountId,
          import_id: importRow.id as string,
          statement_period_start: section.periodStart,
          statement_period_end: section.periodEnd,
        });
      }
    }

    await supabase
      .from("imports")
      .update({ status: "COMMITTED", new_count: insertedCount })
      .eq("id", importRow.id);
  } catch (e) {
    await supabase.from("imports").update({ status: "FAILED" }).eq("id", importRow.id);
    throw e;
  }

  // A newly-imported transaction can complete an already-unambiguous
  // exact-reference-and-amount pair against an existing settlement batch
  // — check immediately rather than leaving it for a manual click.
  const { resolvedCount: autoResolvedCount } = await autoResolveExactMatches(supabase);

  return { insertedCount, skippedAlreadyImportedCount, skippedUnrecognizedAccountCount, autoResolvedCount };
}
