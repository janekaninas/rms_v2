import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomRevenuePreview, ResolvedRoomRevenueRow } from "./resolve-room-revenue";
import { recomputeReservations } from "../financial/recompute";

export async function commitRoomRevenueImport(
  supabase: SupabaseClient,
  fileName: string,
  preview: RoomRevenuePreview,
) {
  // FINANCIAL_LOGIC.md §7 / IMPORT_LOGIC.md §3: once a reservation has an
  // approved manual override, its imported per-night figures are not
  // used — the even-split rows generated from the override are
  // authoritative instead. Silently excluded here, not an error.
  const toWrite = preview.rows.filter(
    (r) => (r.action === "NEW" || r.action === "UPDATE") && !r.hasApprovedOverride,
  );
  const errorRows = preview.rows.filter((r) => r.action === "ERROR");

  const { data: importRow, error: importError } = await supabase
    .from("imports")
    .insert({
      import_type: "ROOM_REVENUE",
      filename: fileName,
      row_count: preview.totalRows,
      new_count: preview.counts.new,
      updated_count: preview.counts.updated,
      ignored_count: preview.counts.unchanged,
      unmatched_count: preview.counts.unmatchedReservation,
      error_count: preview.counts.errors,
      status: "PENDING_REVIEW",
    })
    .select("id")
    .single();
  if (importError) throw new Error(`Failed to record import summary: ${importError.message}`);
  const importId = importRow.id as string;

  try {
    await writeRows(supabase, importId, toWrite);
  } catch (e) {
    await supabase.from("imports").update({ status: "FAILED" }).eq("id", importId);
    throw e;
  }

  if (errorRows.length > 0) {
    const errorPayload = errorRows.map((r) => ({
      import_id: importId,
      row_number: r.row.sourceRowNumber,
      raw_data: r.row as unknown as Record<string, unknown>,
      error_type: "VALIDATION_ERROR",
      message: r.errorReason ?? r.row.errors.join("; "),
    }));
    await supabase.from("import_row_errors").insert(errorPayload);
  }

  const affectedReservationIds = [...new Set(toWrite.map((r) => r.reservationId).filter((id): id is string => id !== null))];
  await recomputeReservations(supabase, affectedReservationIds);

  await supabase.from("imports").update({ status: "COMMITTED" }).eq("id", importId);

  return { importId };
}

async function writeRows(supabase: SupabaseClient, importId: string, toWrite: ResolvedRoomRevenueRow[]) {
  const matched = toWrite.filter((r) => r.reservationId !== null);
  const unmatched = toWrite.filter((r) => r.reservationId === null);

  if (matched.length > 0) {
    const payload = matched.map((r) => ({
      reservation_id: r.reservationId,
      villa_id: r.villaId,
      stay_date: r.row.stayDate,
      room_number: r.row.roomNumber,
      revenue_type: "STAY" as const,
      revenue_source_status: "ACTUAL_ROOM_REVENUE" as const,
      commercial_revenue_basis_amount: r.row.commercialRevenueBasisAmount,
      source_import_id: importId,
    }));
    const { error } = await supabase
      .from("daily_revenue")
      .upsert(payload, { onConflict: "reservation_id,stay_date,revenue_type" });
    if (error) throw new Error(`daily_revenue upsert (matched) failed: ${error.message}`);
  }

  if (unmatched.length > 0) {
    // PostgREST's upsert can't target a partial unique index (this
    // dedupe key only applies WHERE reservation_id IS NULL), so unmatched
    // rows are deduped manually: fetch what's already there for this
    // batch's keys, update those, insert the rest.
    const { data: existingUnmatched } = await supabase
      .from("daily_revenue")
      .select("id, villa_id, stay_date, revenue_type, room_number")
      .is("reservation_id", null)
      .in("villa_id", [...new Set(unmatched.map((r) => r.villaId as string))]);
    const existingKey = new Map(
      (existingUnmatched ?? []).map((d) => [
        `${d.villa_id}:${d.stay_date}:${d.revenue_type}:${d.room_number ?? ""}`,
        d.id as string,
      ]),
    );

    const toUpdate: { id: string; commercial_revenue_basis_amount: number | null; source_import_id: string }[] = [];
    const toInsert: Record<string, unknown>[] = [];
    for (const r of unmatched) {
      const key = `${r.villaId}:${r.row.stayDate}:STAY:${r.row.roomNumber ?? ""}`;
      const existingId = existingKey.get(key);
      if (existingId) {
        toUpdate.push({
          id: existingId,
          commercial_revenue_basis_amount: r.row.commercialRevenueBasisAmount,
          source_import_id: importId,
        });
      } else {
        toInsert.push({
          reservation_id: null,
          villa_id: r.villaId,
          stay_date: r.row.stayDate,
          room_number: r.row.roomNumber,
          revenue_type: "STAY" as const,
          revenue_source_status: "ACTUAL_ROOM_REVENUE" as const,
          commercial_revenue_basis_amount: r.row.commercialRevenueBasisAmount,
          source_import_id: importId,
        });
      }
    }

    const writtenIds: string[] = [];
    if (toInsert.length > 0) {
      const { data: inserted, error } = await supabase.from("daily_revenue").insert(toInsert).select("id");
      if (error) throw new Error(`daily_revenue insert (unmatched) failed: ${error.message}`);
      writtenIds.push(...(inserted ?? []).map((d) => d.id as string));
    }
    for (const u of toUpdate) {
      const { error } = await supabase
        .from("daily_revenue")
        .update({ commercial_revenue_basis_amount: u.commercial_revenue_basis_amount, source_import_id: u.source_import_id })
        .eq("id", u.id);
      if (error) throw new Error(`daily_revenue update (unmatched) failed: ${error.message}`);
      writtenIds.push(u.id);
    }

    const { data } = writtenIds.length
      ? await supabase.from("daily_revenue").select("id, villa_id, stay_date, room_number").in("id", writtenIds)
      : { data: [] };

    // DAILY_REVENUE_WITHOUT_BOOKING — never discarded, surfaced for
    // reconciliation, deduped against any already-open exception for
    // the same daily_revenue row.
    if (data && data.length > 0) {
      const ids = data.map((d) => d.id as string);
      const { data: existingOpen } = await supabase
        .from("reconciliation_exceptions")
        .select("daily_revenue_id")
        .in("daily_revenue_id", ids)
        .eq("type", "DAILY_REVENUE_WITHOUT_BOOKING")
        .eq("status", "OPEN");
      const alreadyOpen = new Set((existingOpen ?? []).map((e) => e.daily_revenue_id as string));
      const toInsert = data
        .filter((d) => !alreadyOpen.has(d.id as string))
        .map((d) => ({
          type: "DAILY_REVENUE_WITHOUT_BOOKING",
          daily_revenue_id: d.id,
          detail: { villaId: d.villa_id, stayDate: d.stay_date, roomNumber: d.room_number },
        }));
      if (toInsert.length > 0) {
        await supabase.from("reconciliation_exceptions").insert(toInsert);
      }
    }
  }
}
