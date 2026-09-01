"use server";

import { createClient } from "@/lib/supabase/server";
import { allocateReservationNights, type NightAllocation } from "@/lib/financial/allocate";
import { loadAllocationContext } from "@/lib/financial/context";

export interface CellDrilldownRow {
  reservationId: string;
  reservationNumber: string;
  guestName: string | null;
  /** For the MISSING_PAYMENT_RULE "fix this" link. */
  channelId: string | null;
  channelName: string | null;
  arrivalDate: string;
  departureDate: string;
  status: string;
  isActual: boolean;
  commercialRevenue: number;
  commission: number | null;
  commissionVat: number | null;
  pb1: number | null;
  netRevenue: number | null;
  /** Full night list + override flag so a row can open the identical ReservationDrilldown used on All Bookings, without a second allocation pass on click. */
  nights: NightAllocation[];
  hasApprovedOverride: boolean;
}

export interface CellDrilldownTotals {
  commercialRevenue: number;
  commission: number;
  commissionVat: number;
  pb1: number;
  netRevenue: number;
}

export interface CellDrilldownData {
  villaUnitCount: number;
  occupiedRoomNights: number;
  rows: CellDrilldownRow[];
  totals: CellDrilldownTotals;
}

const EMPTY_TOTALS: CellDrilldownTotals = { commercialRevenue: 0, commission: 0, commissionVat: 0, pb1: 0, netRevenue: 0 };

/**
 * REPORTING_LOGIC.md §2c/§6: every Monthly Performance cell must drill
 * down to its constituent reservations, explaining the villa/date result
 * (occupied/available room nights, actual-vs-estimated composition, and
 * per-reservation figures) — computed on demand (only when a cell is
 * clicked), not prefetched for all ~1,000 cells, per the §2e performance
 * note. Reuses allocateReservationNights() so this figure can never
 * disagree with All Bookings for the same reservation/night.
 */
export async function getCellDrilldown(villaId: string, date: string): Promise<CellDrilldownData> {
  const supabase = await createClient();

  const [{ data: villaRow }, { data: reservations, error }] = await Promise.all([
    supabase.from("villas").select("unit_count").eq("id", villaId).single(),
    supabase
      .from("reservations")
      .select(
        "id, reservation_number, guest_name, channel_id, channels(display_name), arrival_date, departure_date, status, system_gross_revenue, final_gross_revenue, villa_id",
      )
      .eq("villa_id", villaId)
      .eq("status", "ACTIVE")
      .lte("arrival_date", date)
      .gt("departure_date", date),
  ]);
  if (error) throw new Error(error.message);

  const villaUnitCount = villaRow?.unit_count ?? 0;
  if (!reservations || reservations.length === 0) {
    return { villaUnitCount, occupiedRoomNights: 0, rows: [], totals: EMPTY_TOTALS };
  }

  const reservationIds = reservations.map((r) => r.id);
  const channelIds = [...new Set(reservations.map((r) => r.channel_id).filter((v): v is string => v !== null))];

  const [{ data: dailyRows }, { data: overrides }, allocationContext] = await Promise.all([
    supabase
      .from("daily_revenue")
      .select("reservation_id, stay_date, commercial_revenue_basis_amount")
      .in("reservation_id", reservationIds)
      .eq("revenue_type", "STAY"),
    supabase.from("revenue_overrides").select("reservation_id, status").in("reservation_id", reservationIds),
    loadAllocationContext(supabase, [villaId], channelIds),
  ]);

  const actualByReservation = new Map<string, { stayDate: string; amount: number }[]>();
  for (const row of dailyRows ?? []) {
    const list = actualByReservation.get(row.reservation_id as string) ?? [];
    list.push({ stayDate: row.stay_date as string, amount: row.commercial_revenue_basis_amount as number });
    actualByReservation.set(row.reservation_id as string, list);
  }
  const approvedOverrideSet = new Set(
    (overrides ?? []).filter((o) => o.status === "APPROVED").map((o) => o.reservation_id as string),
  );

  const rows: CellDrilldownRow[] = reservations.map((r) => {
    // Without generated Database types, supabase-js's untyped select overload
    // infers this embed's shape inconsistently across queries (object here
    // vs. array elsewhere) even though PostgREST always returns a single
    // object for a scalar FK — normalize defensively rather than trust
    // either inferred shape.
    const channelsField = r.channels as unknown as { display_name: string | null } | { display_name: string | null }[] | null;
    const channelName = Array.isArray(channelsField) ? (channelsField[0]?.display_name ?? null) : (channelsField?.display_name ?? null);

    const authoritativeTotal = r.final_gross_revenue ?? r.system_gross_revenue ?? null;
    const allocation = allocateReservationNights({
      arrivalDate: r.arrival_date,
      departureDate: r.departure_date,
      authoritativeTotal,
      actualRows: actualByReservation.get(r.id) ?? [],
      channelId: r.channel_id,
      villaId: r.villa_id,
      villaGroupId: r.villa_id ? (allocationContext.villaGroupByVilla.get(r.villa_id) ?? null) : null,
      rules: allocationContext.rules,
      assignments: allocationContext.assignments,
      profiles: allocationContext.profiles,
    });
    const night = allocation.nights.find((n) => n.stayDate === date);

    return {
      reservationId: r.id,
      reservationNumber: r.reservation_number,
      guestName: r.guest_name,
      channelId: r.channel_id,
      channelName,
      arrivalDate: r.arrival_date,
      departureDate: r.departure_date,
      status: r.status,
      isActual: night?.isActual ?? false,
      commercialRevenue: night?.amount ?? 0,
      commission: night?.commission ?? null,
      commissionVat: night?.commissionVat ?? null,
      pb1: night?.pb1 ?? null,
      netRevenue: night?.netRevenue ?? null,
      nights: allocation.nights,
      hasApprovedOverride: approvedOverrideSet.has(r.id),
    };
  });

  const totals = rows.reduce<CellDrilldownTotals>(
    (acc, r) => ({
      commercialRevenue: acc.commercialRevenue + r.commercialRevenue,
      commission: acc.commission + (r.commission ?? 0),
      commissionVat: acc.commissionVat + (r.commissionVat ?? 0),
      pb1: acc.pb1 + (r.pb1 ?? 0),
      netRevenue: acc.netRevenue + (r.netRevenue ?? 0),
    }),
    { ...EMPTY_TOTALS },
  );

  return { villaUnitCount, occupiedRoomNights: reservations.length, rows, totals };
}
