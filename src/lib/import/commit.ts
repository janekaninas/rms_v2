import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportKind, ImportPreview, ResolvedRow } from "./types";

function computeNights(arrival: string | null, departure: string | null): number {
  if (!arrival || !departure) return 0;
  return Math.round((new Date(departure).getTime() - new Date(arrival).getTime()) / (1000 * 60 * 60 * 24));
}

function toReservationPayload(r: ResolvedRow) {
  return {
    portfolio: "AASHA" as const,
    reservation_number: r.row.reservationNumber,
    channel_id: r.channelId,
    villa_id: r.villaId,
    room_number: r.row.roomNumber,
    room_type: r.row.roomType,
    guest_name: r.row.guestName,
    booking_date: r.row.bookingDate,
    arrival_date: r.row.arrivalDate,
    departure_date: r.row.departureDate,
    nights: computeNights(r.row.arrivalDate, r.row.departureDate),
    adults: r.row.adults,
    children: r.row.children,
    status: r.row.status,
    system_gross_revenue: r.row.systemGrossRevenue,
  };
}

export async function commitImport(
  supabase: SupabaseClient,
  importType: ImportKind,
  fileName: string,
  preview: ImportPreview,
) {
  const toWriteRaw = preview.rows.filter((r) => r.action === "NEW" || r.action === "UPDATE");
  const errorRows = preview.rows.filter((r) => r.action === "ERROR");

  // Real exports have been observed to repeat the exact same reservation
  // number more than once within a single file (an export artifact, not
  // a meaningful update) — Postgres rejects a bulk upsert that tries to
  // affect the same conflict target twice in one statement. Collapse to
  // the last occurrence per reservation_number for the write itself, and
  // surface the fact via the existing DUPLICATE_RESERVATION exception
  // type rather than silently dropping the signal.
  const byReservationNumber = new Map<string, ResolvedRow[]>();
  for (const r of toWriteRaw) {
    const list = byReservationNumber.get(r.row.reservationNumber) ?? [];
    list.push(r);
    byReservationNumber.set(r.row.reservationNumber, list);
  }
  const toWrite = Array.from(byReservationNumber.values()).map(
    (group) => group[group.length - 1],
  );
  const duplicatedInFile = Array.from(byReservationNumber.entries())
    .filter(([, group]) => group.length > 1)
    .map(([reservationNumber]) => reservationNumber);

  // Created first so its id can be stamped onto every reservation written
  // by this run — counts are already known from the preview step.
  const { data: importRow, error: importError } = await supabase
    .from("imports")
    .insert({
      import_type: importType,
      filename: fileName,
      row_count: preview.totalRows,
      new_count: preview.counts.new,
      updated_count: preview.counts.updated,
      ignored_count: preview.counts.unchanged,
      unmatched_count: preview.counts.unmatchedVilla + preview.counts.unmatchedChannel,
      error_count: preview.counts.errors,
      status: "PENDING_REVIEW",
    })
    .select("id")
    .single();
  if (importError) throw new Error(`Failed to record import summary: ${importError.message}`);
  const importId = importRow.id as string;

  try {
    await commitRows(supabase, importType, importId, toWrite, duplicatedInFile, byReservationNumber, errorRows);
  } catch (e) {
    await supabase.from("imports").update({ status: "FAILED" }).eq("id", importId);
    throw e;
  }

  await supabase.from("imports").update({ status: "COMMITTED" }).eq("id", importId);

  return { importId };
}

async function commitRows(
  supabase: SupabaseClient,
  importType: ImportKind,
  importId: string,
  toWrite: ResolvedRow[],
  duplicatedInFile: string[],
  byReservationNumber: Map<string, ResolvedRow[]>,
  errorRows: ResolvedRow[],
) {
  let upsertedIds = new Map<string, string>(); // reservation_number -> id

  if (importType !== "CANCELLATIONS") {
    if (toWrite.length > 0) {
      const payload = toWrite.map((r) => ({
        ...toReservationPayload(r),
        source_file_import_id: importId,
      }));
      const { data, error } = await supabase
        .from("reservations")
        .upsert(payload, { onConflict: "portfolio,reservation_number" })
        .select("id, reservation_number");
      if (error) throw new Error(`Reservation upsert failed: ${error.message}`);
      upsertedIds = new Map((data ?? []).map((d) => [d.reservation_number, d.id]));
    }
  } else {
    // Cancellations never overwrite an existing reservation's descriptive
    // fields (IMPORT_LOGIC.md §2) — only status changes for rows that
    // already exist; a minimal record is created for rows that don't.
    const toUpdate = toWrite.filter((r) => r.existingReservationId);
    const toInsert = toWrite.filter((r) => !r.existingReservationId);

    if (toUpdate.length > 0) {
      const ids = toUpdate.map((r) => r.existingReservationId as string);
      const { error } = await supabase.from("reservations").update({ status: "CANCELLED" }).in("id", ids);
      if (error) throw new Error(`Cancellation status update failed: ${error.message}`);
      toUpdate.forEach((r) => upsertedIds.set(r.row.reservationNumber, r.existingReservationId as string));
    }

    if (toInsert.length > 0) {
      const payload = toInsert.map((r) => ({ ...toReservationPayload(r), source_file_import_id: importId }));
      const { data, error } = await supabase
        .from("reservations")
        .upsert(payload, { onConflict: "portfolio,reservation_number" })
        .select("id, reservation_number");
      if (error) throw new Error(`Minimal cancellation reservation insert failed: ${error.message}`);
      (data ?? []).forEach((d) => upsertedIds.set(d.reservation_number, d.id));
    }
  }

  // Status history: only for rows whose status is CANCELLED and which
  // are actually transitioning into that state this run (never on a
  // no-op re-upload) — idempotent via the (reservation_id, status,
  // effective_at) unique constraint as a second safeguard.
  const historyRows: { reservation_id: string; status: "CANCELLED"; effective_at: string; reason: string | null; source_import_id: string }[] = [];
  for (const r of toWrite) {
    if (r.row.status !== "CANCELLED") continue;
    const reservationId = upsertedIds.get(r.row.reservationNumber);
    if (!reservationId) continue;

    let effectiveAt: string;
    if (r.row.cancelDate) {
      const time = r.row.cancelTime ? r.row.cancelTime.replace(/\./g, ":") : "00:00:00";
      effectiveAt = `${r.row.cancelDate}T${time}`;
    } else {
      effectiveAt = new Date().toISOString();
    }

    historyRows.push({
      reservation_id: reservationId,
      status: "CANCELLED",
      effective_at: effectiveAt,
      reason: r.row.cancelReason,
      source_import_id: importId,
    });
  }
  if (historyRows.length > 0) {
    const { error } = await supabase
      .from("reservation_status_history")
      .upsert(historyRows, { onConflict: "reservation_id,status,effective_at", ignoreDuplicates: true });
    if (error) throw new Error(`Failed to write status history: ${error.message}`);
  }

  // Reconciliation exceptions for unresolved lookups and within-file
  // duplicates — skip rows that already have an open exception of the
  // same type (avoid duplicate spam on repeated uploads of a still-
  // unresolved row).
  const duplicatedSet = new Set(duplicatedInFile);
  const candidateExceptions = toWrite
    .filter((r) => r.villaUnknown || r.channelUnknown || duplicatedSet.has(r.row.reservationNumber))
    .map((r) => ({ r, reservationId: upsertedIds.get(r.row.reservationNumber) }))
    .filter((x): x is { r: ResolvedRow; reservationId: string } => Boolean(x.reservationId));

  if (candidateExceptions.length > 0) {
    const ids = candidateExceptions.map((x) => x.reservationId);
    const { data: existingOpen } = await supabase
      .from("reconciliation_exceptions")
      .select("reservation_id, type")
      .in("reservation_id", ids)
      .eq("status", "OPEN");
    const openSet = new Set((existingOpen ?? []).map((e) => `${e.reservation_id}:${e.type}`));

    const toInsertExceptions: {
      type: string;
      reservation_id: string;
      detail: Record<string, unknown>;
    }[] = [];

    for (const { r, reservationId } of candidateExceptions) {
      if (r.villaUnknown && !openSet.has(`${reservationId}:UNKNOWN_VILLA`)) {
        toInsertExceptions.push({
          type: "UNKNOWN_VILLA",
          reservation_id: reservationId,
          detail: { roomNumber: r.row.roomNumber, roomType: r.row.roomType },
        });
      }
      if (r.channelUnknown && !openSet.has(`${reservationId}:UNKNOWN_CHANNEL`)) {
        toInsertExceptions.push({
          type: "UNKNOWN_CHANNEL",
          reservation_id: reservationId,
          detail: { channelRawName: r.row.channelRawName },
        });
      }
      if (
        duplicatedSet.has(r.row.reservationNumber) &&
        !openSet.has(`${reservationId}:DUPLICATE_RESERVATION`)
      ) {
        toInsertExceptions.push({
          type: "DUPLICATE_RESERVATION",
          reservation_id: reservationId,
          detail: {
            reservationNumber: r.row.reservationNumber,
            occurrences: byReservationNumber.get(r.row.reservationNumber)?.map((g) => g.row.sourceRowNumber),
            note: "Reservation number appeared more than once in the same source file; the last occurrence was kept.",
          },
        });
      }
    }

    if (toInsertExceptions.length > 0) {
      const { error } = await supabase.from("reconciliation_exceptions").insert(toInsertExceptions);
      if (error) throw new Error(`Failed to write reconciliation exceptions: ${error.message}`);
    }
  }

  // Row-level errors (missing/unparseable required fields) — never
  // silently dropped.
  if (errorRows.length > 0) {
    const errorPayload = errorRows.map((r) => ({
      import_id: importId,
      row_number: r.row.sourceRowNumber,
      raw_data: r.row as unknown as Record<string, unknown>,
      error_type: "VALIDATION_ERROR",
      message: r.row.errors.join("; "),
    }));
    const { error } = await supabase.from("import_row_errors").insert(errorPayload);
    if (error) throw new Error(`Failed to record row errors: ${error.message}`);
  }
}
