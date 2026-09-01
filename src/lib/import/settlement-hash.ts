import { createHash } from "crypto";

/**
 * Idempotency (DATA_MODEL.md §7, mandatory): used only when the OTA's own
 * batch_reference is absent. Deterministic from stable batch fields so
 * re-uploading the same settlement file computes the same hash and is
 * recognized as already-imported, never duplicated.
 */
export function batchDedupeHash(channelId: string, batchDate: string, netAmount: number, currency: string): string {
  return createHash("sha256").update(`${channelId}|${batchDate}|${netAmount.toFixed(2)}|${currency}`).digest("hex");
}

/**
 * Used only when a line has no external_line_ref of its own. Scoped to
 * (batch_id, dedupe_hash) by the DB unique index, so this need only be
 * unique *within* a batch — it deliberately does not embed the batch's
 * own identity, since that would differ between preview time (no batch
 * id yet) and commit time (a real one) and break the idempotency check.
 */
export function lineDedupeHash(
  rawReservationReference: string | null,
  amount: number,
  description: string | null,
): string {
  return createHash("sha256")
    .update(`${rawReservationReference ?? ""}|${amount.toFixed(2)}|${description ?? ""}`)
    .digest("hex");
}
