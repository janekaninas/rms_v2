import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedRoomRevenueRow } from "./map-room-revenue";

export interface ResolvedRoomRevenueRow {
  row: NormalizedRoomRevenueRow;
  action: "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";
  reservationId: string | null;
  villaId: string | null;
  /** Reservation matched by number, but no room mapping resolves — informational only, the reservation's own villa_id is still used. */
  hasApprovedOverride: boolean;
  errorReason: string | null;
}

export interface RoomRevenuePreview {
  fileName: string;
  totalRows: number;
  counts: {
    new: number;
    updated: number;
    unchanged: number;
    unmatchedReservation: number;
    errors: number;
  };
  rows: ResolvedRoomRevenueRow[];
}

interface MappingLookup {
  match_type: "ROOM_NUMBER" | "ROOM_TYPE" | "LISTING";
  raw_value: string;
  villa_id: string;
}

function resolveVillaByRoom(
  roomNumber: string | null,
  roomType: string | null,
  mappings: MappingLookup[],
): string | null {
  if (roomNumber) {
    const byNumber = mappings.find((m) => m.match_type === "ROOM_NUMBER" && m.raw_value.trim() === roomNumber.trim());
    if (byNumber) return byNumber.villa_id;
  }
  if (roomType) {
    const byType = mappings.find((m) => m.match_type === "ROOM_TYPE" && m.raw_value.trim() === roomType.trim());
    if (byType) return byType.villa_id;
  }
  return null;
}

export async function resolveRoomRevenueRows(
  supabase: SupabaseClient,
  fileName: string,
  rows: NormalizedRoomRevenueRow[],
): Promise<RoomRevenuePreview> {
  const reservationNumbers = [...new Set(rows.map((r) => r.reservationNumber).filter(Boolean))];

  const [{ data: reservations }, { data: mappings }, { data: overrides }] = await Promise.all([
    reservationNumbers.length
      ? supabase
          .from("reservations")
          .select("id, reservation_number, villa_id")
          .eq("portfolio", "AASHA")
          .in("reservation_number", reservationNumbers)
      : Promise.resolve({ data: [] }),
    supabase.from("room_villa_mapping").select("match_type, raw_value, villa_id").eq("portfolio", "AASHA"),
    reservationNumbers.length
      ? supabase.from("revenue_overrides").select("reservation_id, status")
      : Promise.resolve({ data: [] }),
  ]);

  const reservationByNumber = new Map(
    (reservations ?? []).map((r) => [r.reservation_number as string, { id: r.id as string, villaId: r.villa_id as string | null }]),
  );
  const mappingList = (mappings ?? []) as MappingLookup[];
  const approvedOverrideReservationIds = new Set(
    (overrides ?? []).filter((o) => o.status === "APPROVED").map((o) => o.reservation_id as string),
  );

  const reservationIds = [...reservationByNumber.values()].map((r) => r.id);
  const { data: existingDaily } = reservationIds.length
    ? await supabase
        .from("daily_revenue")
        .select("reservation_id, stay_date, revenue_type, commercial_revenue_basis_amount")
        .in("reservation_id", reservationIds)
        .eq("revenue_type", "STAY")
    : { data: [] };
  const existingByKey = new Map(
    (existingDaily ?? []).map((d) => [`${d.reservation_id}:${d.stay_date}`, d.commercial_revenue_basis_amount as number]),
  );

  const resolved: ResolvedRoomRevenueRow[] = rows.map((row) => {
    if (row.errors.length > 0) {
      return {
        row,
        action: "ERROR",
        reservationId: null,
        villaId: null,
        hasApprovedOverride: false,
        errorReason: row.errors.join("; "),
      };
    }

    const matched = reservationByNumber.get(row.reservationNumber) ?? null;

    if (matched) {
      const hasApprovedOverride = approvedOverrideReservationIds.has(matched.id);
      if (!matched.villaId) {
        // Reservation exists but its own villa is unresolved — still
        // store the revenue row (villa is required on daily_revenue,
        // so without one this row cannot be attached at all).
        return {
          row,
          action: "ERROR",
          reservationId: matched.id,
          villaId: null,
          hasApprovedOverride,
          errorReason: "Reservation's villa is not resolved yet — cannot store a daily_revenue row without a villa.",
        };
      }
      const existingAmount = existingByKey.get(`${matched.id}:${row.stayDate}`);
      const action =
        existingAmount === undefined
          ? "NEW"
          : Math.abs((row.commercialRevenueBasisAmount ?? 0) - existingAmount) > 0.5
            ? "UPDATE"
            : "UNCHANGED";
      return {
        row,
        action,
        reservationId: matched.id,
        villaId: matched.villaId,
        hasApprovedOverride,
        errorReason: null,
      };
    }

    // IMPORT_LOGIC.md §3: an unmatched reservation number must not be
    // dropped — still store the row (DAILY_REVENUE_WITHOUT_BOOKING) if
    // its villa resolves independently via room mapping.
    const villaId = resolveVillaByRoom(row.roomNumber, row.roomType, mappingList);
    if (!villaId) {
      return {
        row,
        action: "ERROR",
        reservationId: null,
        villaId: null,
        hasApprovedOverride: false,
        errorReason: "No matching reservation and no villa mapping for this room — cannot store the row.",
      };
    }
    return {
      row,
      action: "NEW",
      reservationId: null,
      villaId,
      hasApprovedOverride: false,
      errorReason: null,
    };
  });

  const counts = resolved.reduce(
    (acc, r) => {
      if (r.action === "NEW") acc.new++;
      else if (r.action === "UPDATE") acc.updated++;
      else if (r.action === "UNCHANGED") acc.unchanged++;
      else if (r.action === "ERROR") acc.errors++;
      if (r.action !== "ERROR" && !r.reservationId) acc.unmatchedReservation++;
      return acc;
    },
    { new: 0, updated: 0, unchanged: 0, unmatchedReservation: 0, errors: 0 },
  );

  return { fileName, totalRows: rows.length, counts, rows: resolved };
}
