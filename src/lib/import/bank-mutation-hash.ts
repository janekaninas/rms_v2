import { createHash } from "crypto";

/**
 * Idempotency (DATA_MODEL.md §6, mandatory): used only when a transaction
 * has no external_line_ref of its own — confirmed true for every real BCA
 * sample this revision (no separate reference/sequence column exists at
 * all). Folds in running_balance beyond DATA_MODEL.md §6's literal
 * (bank_account_id, transaction_date, amount, description, reference)
 * formula, since running_balance is a stable historical fact of a given
 * real transaction and disambiguates two same-day/same-amount/
 * same-description rows (e.g. two identical BCA admin-fee lines) that
 * would otherwise hash identically — the same engineering-judgment
 * strengthening already applied to OTA settlement lines for an analogous
 * real-data collision risk (src/lib/settlement/commit.ts).
 */
export function transactionDedupeHash(
  bankAccountId: string,
  transactionDate: string,
  amount: number,
  description: string,
  runningBalance: number | null,
): string {
  return createHash("sha256")
    .update(`${bankAccountId}|${transactionDate}|${amount.toFixed(2)}|${description}|${runningBalance ?? ""}`)
    .digest("hex");
}
