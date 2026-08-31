import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportKind, NormalizedReservationRow, ResolvedRow, ImportPreview } from "./types";

interface ChannelLookup {
  id: string;
  raw_name: string;
  channel_type: string;
}

interface ChannelAliasLookup {
  channel_id: string;
  raw_value: string;
}

function normalizeForMatch(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase();
}

interface MappingLookup {
  match_type: "ROOM_NUMBER" | "ROOM_TYPE" | "LISTING";
  raw_value: string;
  villa_id: string;
}

interface ExistingReservation {
  id: string;
  reservation_number: string;
  status: "ACTIVE" | "CANCELLED";
  villa_id: string | null;
  room_number: string | null;
  arrival_date: string;
  departure_date: string;
  system_gross_revenue: number | null;
}

function resolveChannel(
  channelRawName: string | null,
  channels: ChannelLookup[],
  aliasesByRawValue: Map<string, string>,
): { channelId: string | null; unknown: boolean } {
  // IMPORT_LOGIC.md §1: a blank Reservation Name resolves to Direct, not
  // to UNKNOWN_CHANNEL — resolved against the seeded DIRECT channel row.
  if (channelRawName === null) {
    const direct = channels.find((c) => c.channel_type === "DIRECT");
    return direct ? { channelId: direct.id, unknown: false } : { channelId: null, unknown: true };
  }
  const normalized = normalizeForMatch(channelRawName);
  const match = channels.find((c) => normalizeForMatch(c.raw_name) === normalized);
  if (match) return { channelId: match.id, unknown: false };

  // VHP exposes the same channel under different raw text depending on
  // report type (e.g. Bookings shows "AGODA", the Arrival Report shows
  // "AGODA, T&T") — confirmed configuration, not inferred at import time.
  const aliasChannelId = aliasesByRawValue.get(normalized);
  if (aliasChannelId) return { channelId: aliasChannelId, unknown: false };

  return { channelId: null, unknown: true };
}

function resolveVilla(
  roomNumber: string | null,
  roomType: string | null,
  mappings: MappingLookup[],
): { villaId: string | null; unknown: boolean } {
  // IMPORT_LOGIC.md §1: villa from Room Number, falling back to Room Type
  // when the room number is unavailable or doesn't resolve (legacy
  // Bookings!AI). Never falls back to guessing — an unmatched room
  // number AND room type is UNKNOWN_VILLA.
  if (roomNumber) {
    const byNumber = mappings.find(
      (m) => m.match_type === "ROOM_NUMBER" && m.raw_value.trim() === roomNumber.trim(),
    );
    if (byNumber) return { villaId: byNumber.villa_id, unknown: false };
  }
  if (roomType) {
    const byType = mappings.find(
      (m) => m.match_type === "ROOM_TYPE" && m.raw_value.trim() === roomType.trim(),
    );
    if (byType) return { villaId: byType.villa_id, unknown: false };
  }
  return { villaId: null, unknown: true };
}

export async function resolveRows(
  supabase: SupabaseClient,
  importKind: ImportKind,
  fileName: string,
  rows: NormalizedReservationRow[],
): Promise<ImportPreview> {
  const [{ data: channels }, { data: aliases }, { data: mappings }, { data: existing }] = await Promise.all([
    supabase.from("channels").select("id, raw_name, channel_type"),
    supabase.from("channel_raw_aliases").select("channel_id, raw_value"),
    supabase.from("room_villa_mapping").select("match_type, raw_value, villa_id").eq("portfolio", "AASHA"),
    supabase
      .from("reservations")
      .select("id, reservation_number, status, villa_id, room_number, arrival_date, departure_date, system_gross_revenue")
      .eq("portfolio", "AASHA"),
  ]);

  const channelList = (channels ?? []) as ChannelLookup[];
  const aliasesByRawValue = new Map<string, string>(
    ((aliases ?? []) as ChannelAliasLookup[]).map((a) => [normalizeForMatch(a.raw_value), a.channel_id]),
  );
  const mappingList = (mappings ?? []) as MappingLookup[];
  const existingByNumber = new Map<string, ExistingReservation>(
    ((existing ?? []) as ExistingReservation[]).map((r) => [r.reservation_number, r]),
  );

  const resolved: ResolvedRow[] = rows.map((row) => {
    if (row.errors.length > 0) {
      return {
        row,
        action: "ERROR",
        channelId: null,
        channelUnknown: false,
        villaId: null,
        villaUnknown: false,
        changeFlags: [],
        existingReservationId: null,
      };
    }

    const { channelId, unknown: channelUnknown } = resolveChannel(row.channelRawName, channelList, aliasesByRawValue);
    const { villaId, unknown: villaUnknown } = resolveVilla(row.roomNumber, row.roomType, mappingList);

    const existingRes = existingByNumber.get(row.reservationNumber) ?? null;

    let action: ResolvedRow["action"];
    const changeFlags: string[] = [];

    if (!existingRes) {
      action = "NEW";
    } else if (importKind === "CANCELLATIONS") {
      action = existingRes.status === "CANCELLED" ? "UNCHANGED" : "UPDATE";
    } else {
      const arrivalChanged = row.arrivalDate !== existingRes.arrival_date;
      const departureChanged = row.departureDate !== existingRes.departure_date;
      const roomChanged = (row.roomNumber ?? null) !== (existingRes.room_number ?? null);
      const rateChanged =
        row.systemGrossRevenue !== null &&
        existingRes.system_gross_revenue !== null &&
        Math.abs(row.systemGrossRevenue - existingRes.system_gross_revenue) > 0.5;
      const statusChanged = row.status !== existingRes.status;

      if (arrivalChanged || departureChanged) changeFlags.push("ARRIVAL_DEPARTURE_MISMATCH");
      if (roomChanged) changeFlags.push("ROOM_CHANGE_DETECTED");

      action =
        arrivalChanged || departureChanged || roomChanged || rateChanged || statusChanged
          ? "UPDATE"
          : "UNCHANGED";
    }

    return {
      row,
      action,
      channelId,
      channelUnknown,
      villaId,
      villaUnknown,
      changeFlags,
      existingReservationId: existingRes?.id ?? null,
    };
  });

  const counts = resolved.reduce(
    (acc, r) => {
      if (r.action === "NEW") acc.new++;
      else if (r.action === "UPDATE") acc.updated++;
      else if (r.action === "UNCHANGED") acc.unchanged++;
      else if (r.action === "ERROR") acc.errors++;
      if (r.villaUnknown) acc.unmatchedVilla++;
      if (r.channelUnknown) acc.unmatchedChannel++;
      return acc;
    },
    { new: 0, updated: 0, unchanged: 0, unmatchedVilla: 0, unmatchedChannel: 0, errors: 0 },
  );

  return {
    importKind,
    fileName,
    totalRows: rows.length,
    counts,
    rows: resolved,
  };
}
