"use server";

import { createClient } from "@/lib/supabase/server";
import { allocateReservationNights } from "@/lib/financial/allocate";
import { loadAllocationContext } from "@/lib/financial/context";

export interface CellDrilldownRow {
  reservationId: string;
  reservationNumber: string;
  guestName: string | null;
  channelName: string | null;
  isActual: boolean;
  amount: number;
  commission: number | null;
  commissionVat: number | null;
  serviceChargeExtraction: number | null;
  pb1: number | null;
  netRevenue: number | null;
}

/**
 * REPORTING_LOGIC.md §2c/§6: every Monthly Performance cell must drill
 * down to its constituent reservations — computed on demand (only when a
 * cell is actually clicked), not prefetched for all ~1,000 cells, per the
 * §2e performance note. Reuses allocateReservationNights() so this figure
 * can never disagree with All Bookings for the same reservation/night.
 */
export async function getCellDrilldown(villaId: string, date: string): Promise<CellDrilldownRow[]> {
  const supabase = await createClient();

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select(
      "id, reservation_number, guest_name, channel_id, channels(display_name), arrival_date, departure_date, status, system_gross_revenue, final_gross_revenue, villa_id",
    )
    .eq("villa_id", villaId)
    .eq("status", "ACTIVE")
    .lte("arrival_date", date)
    .gt("departure_date", date);
  if (error) throw new Error(error.message);
  if (!reservations || reservations.length === 0) return [];

  const reservationIds = reservations.map((r) => r.id);
  const channelIds = [...new Set(reservations.map((r) => r.channel_id).filter((v): v is string => v !== null))];

  const [{ data: dailyRows }, allocationContext] = await Promise.all([
    supabase
      .from("daily_revenue")
      .select("reservation_id, stay_date, commercial_revenue_basis_amount")
      .in("reservation_id", reservationIds)
      .eq("revenue_type", "STAY"),
    loadAllocationContext(supabase, [villaId], channelIds),
  ]);

  const actualByReservation = new Map<string, { stayDate: string; amount: number }[]>();
  for (const row of dailyRows ?? []) {
    const list = actualByReservation.get(row.reservation_id as string) ?? [];
    list.push({ stayDate: row.stay_date as string, amount: row.commercial_revenue_basis_amount as number });
    actualByReservation.set(row.reservation_id as string, list);
  }

  return reservations.map((r) => {
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
      channelName,
      isActual: night?.isActual ?? false,
      amount: night?.amount ?? 0,
      commission: night?.commission ?? null,
      commissionVat: night?.commissionVat ?? null,
      serviceChargeExtraction: night?.serviceChargeExtraction ?? null,
      pb1: night?.pb1 ?? null,
      netRevenue: night?.netRevenue ?? null,
    };
  });
}
