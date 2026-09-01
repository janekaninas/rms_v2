import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveVilla, type MappingLookup } from "./resolve";
import { recomputeReservations, syncExceptions } from "../financial/recompute";

export interface ReresolveVillasResult {
  /** Reservations whose resolved villa_id actually changed (including newly resolved or newly unresolved). */
  changedCount: number;
  /** Of those, how many gained a villa for the first time (were UNKNOWN_VILLA). */
  newlyResolvedCount: number;
  /** Of those, how many lost their villa (a mapping was removed/repointed and nothing else matches). */
  newlyUnresolvedCount: number;
}

/**
 * DATA_MODEL.md §1 / IMPORT_LOGIC.md §6: a Villa Mapping change must
 * re-resolve every already-imported AASHA reservation from its
 * already-stored raw `room_number`/`room_type` — never require a
 * re-upload of Arrival Report/Bookings/Cancellations/Room Revenue just to
 * apply a corrected mapping. Reuses resolveVilla() (the exact import-time
 * matching logic, IMPORT_LOGIC.md §1) and recomputeReservations() (the
 * exact Day-3 financial engine) — no second implementation of either.
 *
 * Call this after any room_villa_mapping create/update/delete. Safe to
 * call with no changes pending (a no-op, cheap: two bulk reads, no writes).
 */
export async function reresolveVillaMappings(supabase: SupabaseClient): Promise<ReresolveVillasResult> {
  const [{ data: mappingRows }, { data: reservationRows }] = await Promise.all([
    supabase.from("room_villa_mapping").select("match_type, raw_value, villa_id").eq("portfolio", "AASHA"),
    supabase.from("reservations").select("id, villa_id, room_number, room_type").eq("portfolio", "AASHA"),
  ]);

  const mappingList = (mappingRows ?? []) as MappingLookup[];
  const reservationList = reservationRows ?? [];

  // Group by target villaId (or the null-unresolved bucket) so the writes
  // are a handful of bulk `.update().in(...)` calls, not one per
  // reservation (IMPORT_LOGIC.md §7's bulk-operation requirement) — even
  // though this runs on a config-change, not a hot path, the reservation
  // count can still be in the thousands.
  const idsByNewVillaId = new Map<string | null, string[]>();
  const newlyResolvedIds: string[] = [];
  const newlyUnresolvedIds: string[] = [];

  for (const r of reservationList) {
    const { villaId } = resolveVilla(r.room_number, r.room_type, mappingList);
    if (villaId === r.villa_id) continue;

    const list = idsByNewVillaId.get(villaId) ?? [];
    list.push(r.id);
    idsByNewVillaId.set(villaId, list);

    if (villaId !== null && r.villa_id === null) newlyResolvedIds.push(r.id);
    if (villaId === null && r.villa_id !== null) newlyUnresolvedIds.push(r.id);
  }

  const changedIds = [...idsByNewVillaId.values()].flat();
  if (changedIds.length === 0) {
    return { changedCount: 0, newlyResolvedCount: 0, newlyUnresolvedCount: 0 };
  }

  for (const [villaId, ids] of idsByNewVillaId) {
    await supabase.from("reservations").update({ villa_id: villaId }).in("id", ids);
  }

  // UNKNOWN_VILLA mirrors commit.ts's own exception bookkeeping — never
  // silently dropped just because the fix happened outside a fresh import.
  await syncExceptions(supabase, "UNKNOWN_VILLA", newlyUnresolvedIds, newlyResolvedIds);

  // Refresh downstream financials (daily_revenue/expected_settlement) for
  // every reservation whose villa actually changed, via the exact same
  // engine an import uses — a villa change can move a reservation onto a
  // different channel_payment_rules/villa_tax_profile_assignments
  // resolution (villa-specific/villa-group rules, tax profile), so this is
  // not optional even when the reservation's own revenue figures look
  // unrelated to villa identity at first glance.
  await recomputeReservations(supabase, changedIds);

  return {
    changedCount: changedIds.length,
    newlyResolvedCount: newlyResolvedIds.length,
    newlyUnresolvedCount: newlyUnresolvedIds.length,
  };
}
