import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReservationLookup, matchSettlementReservation, type ReservationCandidate } from "../import/settlement-match";
import { refreshBatchStatus } from "./commit";

export interface ReresolveSettlementLinesResult {
  /** Lines that newly resolved to an unambiguous reservation match. */
  resolvedCount: number;
}

/**
 * A reservation's `voucher_number` (or any other match key) can be
 * backfilled *after* a settlement line was already committed and left
 * UNMATCHED (IMPORT_LOGIC.md §8 pt.4's "never discarded" — confirmed
 * necessary in practice: a New Bookings/Cancellations re-import can newly
 * supply the OTA's own booking reference for a reservation that already
 * has settlement lines sitting unresolved). Re-runs the exact same
 * matching logic a fresh settlement commit uses (`matchSettlementReservation`)
 * against every currently-UNMATCHED `BOOKING_PAYOUT` line, never a second
 * drifting implementation — same precedent as `reresolveVillaMappings`
 * for villa-mapping changes.
 *
 * Call this after any New Bookings/Cancellations commit (voucher numbers
 * are backfilled there) and expose it as a manual "re-check now" sweep
 * for lines that were already stuck before this mechanism existed. Never
 * force-picks: an AMBIGUOUS outcome is recorded as PARTIALLY_MATCHED, not
 * silently resolved.
 */
export async function reresolveUnmatchedSettlementLines(supabase: SupabaseClient): Promise<ReresolveSettlementLinesResult> {
  const { data: lineRows } = await supabase
    .from("ota_settlement_lines")
    .select("id, batch_id, raw_reservation_reference, amount")
    .eq("line_type", "BOOKING_PAYOUT")
    .eq("matched_status", "UNMATCHED")
    .not("raw_reservation_reference", "is", null);
  const lines = lineRows ?? [];
  if (lines.length === 0) return { resolvedCount: 0 };

  const batchIds = [...new Set(lines.map((l) => l.batch_id as string))];
  const { data: batchRows } = await supabase.from("ota_settlement_batches").select("id, channel_id").in("id", batchIds);
  const channelIdByBatch = new Map((batchRows ?? []).map((b) => [b.id as string, b.channel_id as string]));

  const channelIds = [...new Set((batchRows ?? []).map((b) => b.channel_id as string))];
  const { data: reservationRows } = await supabase
    .from("reservations")
    .select("id, reservation_number, voucher_number, channel_id")
    .in("channel_id", channelIds.length > 0 ? channelIds : ["00000000-0000-0000-0000-000000000000"]);

  const reservationsByChannel = new Map<string, ReservationCandidate[]>();
  for (const r of reservationRows ?? []) {
    const list = reservationsByChannel.get(r.channel_id as string) ?? [];
    list.push({ id: r.id as string, reservation_number: r.reservation_number as string, voucher_number: r.voucher_number as string | null });
    reservationsByChannel.set(r.channel_id as string, list);
  }
  const lookupByChannel = new Map(
    [...reservationsByChannel.entries()].map(([channelId, candidates]) => [channelId, buildReservationLookup(candidates)]),
  );

  let resolvedCount = 0;
  const affectedBatchIds = new Set<string>();
  const matchedStatusUpdates: { id: string; matched_status: string }[] = [];
  const allocationInserts: { settlement_line_id: string; reservation_id: string; allocated_amount: number; allocation_method: string }[] = [];

  for (const line of lines) {
    const channelId = channelIdByBatch.get(line.batch_id as string);
    const lookup = channelId ? lookupByChannel.get(channelId) : undefined;
    if (!lookup) continue;

    const { outcome, candidates } = matchSettlementReservation(
      line.raw_reservation_reference as string,
      lookup.exactByNumber,
      lookup.normalizedByNumber,
    );

    if (outcome === "MATCHED") {
      matchedStatusUpdates.push({ id: line.id as string, matched_status: "MATCHED" });
      allocationInserts.push({
        settlement_line_id: line.id as string,
        reservation_id: candidates[0].id,
        allocated_amount: line.amount as number,
        allocation_method: "EXACT_MATCH",
      });
      affectedBatchIds.add(line.batch_id as string);
      resolvedCount++;
    } else if (outcome === "AMBIGUOUS") {
      matchedStatusUpdates.push({ id: line.id as string, matched_status: "PARTIALLY_MATCHED" });
    }
    // UNMATCHED: leave as-is, never discarded.
  }

  for (const u of matchedStatusUpdates) {
    await supabase.from("ota_settlement_lines").update({ matched_status: u.matched_status }).eq("id", u.id);
  }
  if (allocationInserts.length > 0) {
    await supabase.from("settlement_reservation_allocations").insert(allocationInserts);
  }
  for (const batchId of affectedBatchIds) {
    await refreshBatchStatus(supabase, batchId);
  }

  return { resolvedCount };
}
