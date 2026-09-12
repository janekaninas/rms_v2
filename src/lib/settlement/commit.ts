import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettlementBatchDraft } from "../import/settlement-types";
import { batchDedupeHash, lineDedupeHash } from "../import/settlement-hash";
import { buildReservationLookup, matchSettlementReservation, type ReservationCandidate } from "../import/settlement-match";
import { deriveBatchStatus } from "./status";
import { autoResolveExactMatches } from "../bank/auto-resolve";

/**
 * Recomputes and persists one batch's status column from its current
 * lines/allocations/reservation figures (REPORTING_LOGIC.md §10) — the
 * same `deriveBatchStatus` the reconciliation page uses live, so the
 * stored value (kept only for fast list filtering) never structurally
 * disagrees with what the page actually shows. Callable standalone so a
 * later manual-allocation action or a reservation recompute can refresh
 * a batch's status without re-running the whole import commit.
 */
export async function refreshBatchStatus(supabase: SupabaseClient, batchId: string) {
  const { data: batch } = await supabase
    .from("ota_settlement_batches")
    .select("net_settlement_amount")
    .eq("id", batchId)
    .single();
  if (!batch) return;

  const { data: lineRows } = await supabase
    .from("ota_settlement_lines")
    .select("id, line_type, raw_reservation_reference")
    .eq("batch_id", batchId);
  const lines = lineRows ?? [];

  const { data: allocationRows } = await supabase
    .from("settlement_reservation_allocations")
    .select("settlement_line_id, reservation_id")
    .in("settlement_line_id", lines.map((l) => l.id).length > 0 ? lines.map((l) => l.id) : ["00000000-0000-0000-0000-000000000000"]);
  const allocations = allocationRows ?? [];
  const allocatedLineIds = new Set(allocations.map((a) => a.settlement_line_id));

  const unresolvedLineCount = lines.filter(
    (l) => l.line_type === "BOOKING_PAYOUT" && l.raw_reservation_reference && !allocatedLineIds.has(l.id),
  ).length;

  const reservationIds = [...new Set(allocations.map((a) => a.reservation_id))];
  let expectedTotal: number | null = 0;
  if (reservationIds.length > 0) {
    const { data: reservations } = await supabase
      .from("reservations")
      .select("id, expected_settlement_amount")
      .in("id", reservationIds);
    for (const r of reservations ?? []) {
      if (r.expected_settlement_amount === null) {
        expectedTotal = null;
        break;
      }
      expectedTotal = (expectedTotal as number) + (r.expected_settlement_amount as number);
    }
  }

  const status = deriveBatchStatus({
    unresolvedLineCount,
    hasAnyAllocation: allocations.length > 0,
    expectedTotal,
    netSettlementAmount: batch.net_settlement_amount as number,
  });

  await supabase.from("ota_settlement_batches").update({ status }).eq("id", batchId);
}

/**
 * Writes one or more settlement batches (with lines and automatic
 * allocation where an unambiguous reservation match exists). Shared by
 * both the parsed-file import path and manual entry (IMPORT_LOGIC.md §8
 * pt.7: "the UI path differs, the data model and reconciliation behavior
 * do not"). Idempotent by construction — a batch/line already present
 * (matched by natural key or dedupe hash) is left untouched, never
 * duplicated, so re-running this with an overlapping or fully-repeated
 * file is always safe.
 */
export async function commitSettlementBatches(
  supabase: SupabaseClient,
  sourceImportId: string | null,
  drafts: SettlementBatchDraft[],
): Promise<{ batchIds: string[] }> {
  const batchIds: string[] = [];

  for (const draft of drafts) {
    const grossAmount = draft.lines
      .filter((l) => l.lineType === "BOOKING_PAYOUT")
      .reduce((sum, l) => sum + l.amount, 0);
    const summedAmount = draft.lines.reduce((sum, l) => sum + l.amount, 0);
    // Prefer the source's own declared total (e.g. Airbnb's Payout row
    // "Paid out") over re-summing lines — that's the actual amount that
    // hit the bank, kept even if it doesn't exactly match the line-level
    // detail (the preview already surfaced any such mismatch).
    const netAmount = draft.declaredNetAmount ?? summedAmount;
    const adjustmentAmount = netAmount - grossAmount;

    let batchId: string;
    if (draft.batchReference) {
      const { data: existing } = await supabase
        .from("ota_settlement_batches")
        .select("id")
        .eq("channel_id", draft.channelId)
        .eq("batch_reference", draft.batchReference)
        .maybeSingle();
      if (existing) {
        batchId = existing.id as string;
      } else {
        const { data: inserted, error } = await supabase
          .from("ota_settlement_batches")
          .insert({
            channel_id: draft.channelId,
            source_import_id: sourceImportId,
            batch_reference: draft.batchReference,
            batch_date: draft.batchDate,
            gross_settlement_amount: grossAmount,
            adjustment_amount: adjustmentAmount,
            net_settlement_amount: netAmount,
            currency: "IDR",
          })
          .select("id")
          .single();
        if (error) throw new Error(`Failed to create settlement batch: ${error.message}`);
        batchId = inserted.id as string;
      }
    } else {
      const hash = batchDedupeHash(draft.channelId, draft.batchDate, netAmount, "IDR");
      const { data: existing } = await supabase
        .from("ota_settlement_batches")
        .select("id")
        .eq("channel_id", draft.channelId)
        .eq("dedupe_hash", hash)
        .maybeSingle();
      if (existing) {
        batchId = existing.id as string;
      } else {
        const { data: inserted, error } = await supabase
          .from("ota_settlement_batches")
          .insert({
            channel_id: draft.channelId,
            source_import_id: sourceImportId,
            batch_reference: null,
            batch_date: draft.batchDate,
            gross_settlement_amount: grossAmount,
            adjustment_amount: adjustmentAmount,
            net_settlement_amount: netAmount,
            currency: "IDR",
            dedupe_hash: hash,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Failed to create settlement batch: ${error.message}`);
        batchId = inserted.id as string;
      }
    }
    batchIds.push(batchId);

    // Line-level idempotency: check first, insert only what's new — a
    // partially-re-uploaded or overlapping file updates/skips at the line
    // level, never just the batch level (IMPORT_LOGIC.md §8 pt.3).
    const { data: existingLineRows } = await supabase
      .from("ota_settlement_lines")
      .select("external_line_ref, dedupe_hash")
      .eq("batch_id", batchId);
    const existingRefs = new Set((existingLineRows ?? []).map((l) => l.external_line_ref).filter(Boolean));
    const existingHashes = new Set((existingLineRows ?? []).map((l) => l.dedupe_hash).filter(Boolean));

    // Real settlement files can carry two genuinely-identical-looking
    // lines within the same batch (confirmed against Agoda: two separate
    // $0 transaction rows for the same reservation/description) — these
    // hash identically, so the DB's (batch_id, dedupe_hash) constraint
    // would reject a bulk insert containing both. Collapse to the last
    // occurrence within this commit, same precedent as the VHP import
    // path's within-file duplicate handling (src/lib/import/commit.ts).
    const byIdentity = new Map<string, (typeof draft.lines)[number] & { dedupeHash: string | null }>();
    for (const l of draft.lines) {
      const dedupeHash = l.externalLineRef ? null : lineDedupeHash(l.rawReservationReference, l.amount, l.description);
      const identity = l.externalLineRef ?? `hash:${dedupeHash}`;
      byIdentity.set(identity, { ...l, dedupeHash });
    }

    const newLinePayloads = [...byIdentity.values()].filter((l) =>
      l.externalLineRef ? !existingRefs.has(l.externalLineRef) : !existingHashes.has(l.dedupeHash),
    );

    if (newLinePayloads.length > 0) {
      const { data: insertedLines, error } = await supabase
        .from("ota_settlement_lines")
        .insert(
          newLinePayloads.map((l) => ({
            batch_id: batchId,
            line_type: l.lineType,
            raw_reservation_reference: l.rawReservationReference,
            description: l.description,
            amount: l.amount,
            external_line_ref: l.externalLineRef,
            dedupe_hash: l.dedupeHash,
            extra_fields: l.extraFields,
          })),
        )
        .select("id, line_type, raw_reservation_reference, amount");
      if (error) throw new Error(`Failed to create settlement lines: ${error.message}`);

      const payoutLines = (insertedLines ?? []).filter(
        (l) => l.line_type === "BOOKING_PAYOUT" && l.raw_reservation_reference,
      );
      if (payoutLines.length > 0) {
        const { data: reservationRows } = await supabase
          .from("reservations")
          .select("id, reservation_number")
          .eq("channel_id", draft.channelId);
        const { exactByNumber, normalizedByNumber } = buildReservationLookup((reservationRows ?? []) as ReservationCandidate[]);

        const matchedStatusUpdates: { id: string; matched_status: string }[] = [];
        const allocationInserts: { settlement_line_id: string; reservation_id: string; allocated_amount: number; allocation_method: string }[] = [];

        for (const line of payoutLines) {
          const { outcome, candidates } = matchSettlementReservation(
            line.raw_reservation_reference as string,
            exactByNumber,
            normalizedByNumber,
          );
          if (outcome === "MATCHED") {
            matchedStatusUpdates.push({ id: line.id, matched_status: "MATCHED" });
            allocationInserts.push({
              settlement_line_id: line.id,
              reservation_id: candidates[0].id,
              allocated_amount: line.amount as number,
              allocation_method: "EXACT_MATCH",
            });
          } else if (outcome === "AMBIGUOUS") {
            matchedStatusUpdates.push({ id: line.id, matched_status: "PARTIALLY_MATCHED" });
          }
          // UNMATCHED lines keep the default 'UNMATCHED' status — never force-matched.
        }

        for (const u of matchedStatusUpdates) {
          await supabase.from("ota_settlement_lines").update({ matched_status: u.matched_status }).eq("id", u.id);
        }
        if (allocationInserts.length > 0) {
          const { error: allocError } = await supabase
            .from("settlement_reservation_allocations")
            .insert(allocationInserts);
          if (allocError) throw new Error(`Failed to create settlement allocations: ${allocError.message}`);
        }
      }
    }

    await refreshBatchStatus(supabase, batchId);
  }

  // A newly-committed batch can complete an already-unambiguous
  // exact-reference-and-amount pair against a bank transaction imported
  // earlier — check immediately rather than leaving it for Bank
  // Reconciliation's manual click (REPORTING_LOGIC.md §11).
  await autoResolveExactMatches(supabase);

  return { batchIds };
}
