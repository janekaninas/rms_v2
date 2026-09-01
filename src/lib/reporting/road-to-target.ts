import type { SupabaseClient } from "@supabase/supabase-js";
import type { Villa, RevenueTarget } from "@/lib/types";
import { allocateReservationNights } from "@/lib/financial/allocate";
import { loadAllocationContext } from "@/lib/financial/context";
import { getMonthRange, listDatesInMonth, type MonthRange } from "./period";
import { computeOccupancyByVillaDate, type OccupancyReservation } from "./occupancy";

export interface RoadToTargetRow {
  villa: Villa | null; // null = portfolio level
  target: number | null;
  currentlyBookedRevenue: number;
  /** Channels with an open MISSING_PAYMENT_RULE excluding at least one night from currentlyBookedRevenue in this scope — each fixable via Configuration → Channel Payment Rules. */
  excludedChannels: { id: string; name: string }[];
  achievementPct: number | null;
  gap: number | null;
  remainingDays: number;
  remainingAvailableRoomNights: number;
  requiredRevenuePerRemainingDay: number | null;
  requiredArrOnRemainingRn: number | null;
}

export interface RoadToTargetData {
  range: MonthRange;
  portfolio: RoadToTargetRow;
  villaRows: RoadToTargetRow[];
}

/**
 * REPORTING_LOGIC.md §8: Currently Booked Revenue blends actual and
 * query-time-estimated (`ESTIMATED_BOOKED`) nights via the same
 * allocateReservationNights() engine every other page uses
 * (FINANCIAL_LOGIC.md §7a/DATA_MODEL.md §9) — never a separate, simpler
 * "final_gross_revenue / nights" recomputation.
 */
export async function loadRoadToTargetData(
  supabase: SupabaseClient,
  year: number,
  month: number,
): Promise<RoadToTargetData> {
  const range = getMonthRange(year, month);
  const dates = listDatesInMonth(range);
  const todayStr = new Date().toISOString().slice(0, 10);
  const remainingDates = dates.filter((d) => d >= todayStr);
  const remainingDays = remainingDates.length;

  const [{ data: villaRowsRaw, error: villaErr }, { data: channelRows }] = await Promise.all([
    supabase.from("villas").select("*").order("villa_code"),
    supabase.from("channels").select("id, display_name"),
  ]);
  if (villaErr) throw new Error(villaErr.message);
  const villas = (villaRowsRaw ?? []) as Villa[];
  const villaIds = villas.map((v) => v.id);
  const channelNameById = new Map((channelRows ?? []).map((c) => [c.id as string, c.display_name as string]));

  const { data: targetRows, error: targetErr } = await supabase
    .from("revenue_targets")
    .select("*")
    .eq("year", year)
    .eq("month", month);
  if (targetErr) throw new Error(targetErr.message);
  const targets = (targetRows ?? []) as RevenueTarget[];
  const portfolioTarget = targets.find((t) => t.villa_id === null)?.revenue_target ?? null;
  const targetByVilla = new Map(
    targets.filter((t) => t.villa_id !== null).map((t) => [t.villa_id as string, t.revenue_target]),
  );

  const { data: reservations, error: resErr } = villaIds.length
    ? await supabase
        .from("reservations")
        .select("id, villa_id, channel_id, arrival_date, departure_date, status, system_gross_revenue, final_gross_revenue")
        .in("villa_id", villaIds)
        .eq("status", "ACTIVE")
        .lt("arrival_date", range.endExclusive)
        .gt("departure_date", range.start)
    : { data: [], error: null };
  if (resErr) throw new Error(resErr.message);
  const resList = reservations ?? [];

  const reservationIds = resList.map((r) => r.id);
  const channelIds = [...new Set(resList.map((r) => r.channel_id).filter((v): v is string => v !== null))];

  const [{ data: dailyRows }, allocationContext] = await Promise.all([
    reservationIds.length
      ? supabase
          .from("daily_revenue")
          .select("reservation_id, stay_date, commercial_revenue_basis_amount")
          .in("reservation_id", reservationIds)
          .eq("revenue_type", "STAY")
      : Promise.resolve({ data: [] }),
    loadAllocationContext(supabase, villaIds, channelIds),
  ]);

  const actualByReservation = new Map<string, { stayDate: string; amount: number }[]>();
  for (const row of dailyRows ?? []) {
    const list = actualByReservation.get(row.reservation_id as string) ?? [];
    list.push({ stayDate: row.stay_date as string, amount: row.commercial_revenue_basis_amount as number });
    actualByReservation.set(row.reservation_id as string, list);
  }

  const bookedByVilla = new Map<string, { revenue: number; excludedChannels: Map<string, string> }>();
  for (const r of resList) {
    if (!r.villa_id) continue;
    const authoritativeTotal = r.final_gross_revenue ?? r.system_gross_revenue ?? null;
    const allocation = allocateReservationNights({
      arrivalDate: r.arrival_date,
      departureDate: r.departure_date,
      authoritativeTotal,
      actualRows: actualByReservation.get(r.id) ?? [],
      channelId: r.channel_id,
      villaId: r.villa_id,
      villaGroupId: allocationContext.villaGroupByVilla.get(r.villa_id) ?? null,
      rules: allocationContext.rules,
      assignments: allocationContext.assignments,
      profiles: allocationContext.profiles,
    });
    const entry = bookedByVilla.get(r.villa_id) ?? { revenue: 0, excludedChannels: new Map<string, string>() };
    for (const night of allocation.nights) {
      if (night.stayDate < range.start || night.stayDate > range.endInclusive) continue;
      if (night.netRevenue === null) {
        if (r.channel_id) {
          entry.excludedChannels.set(r.channel_id, channelNameById.get(r.channel_id) ?? "Unknown channel");
        }
      } else {
        entry.revenue += night.netRevenue;
      }
    }
    bookedByVilla.set(r.villa_id, entry);
  }

  const occupancyRemaining = computeOccupancyByVillaDate(resList as OccupancyReservation[], remainingDates);

  function computeRow(villa: Villa | null, unitCount: number, target: number | null, villaIdsInScope: string[]): RoadToTargetRow {
    let currentlyBookedRevenue = 0;
    const excludedChannelsMap = new Map<string, string>();
    for (const vid of villaIdsInScope) {
      const b = bookedByVilla.get(vid);
      if (b) {
        currentlyBookedRevenue += b.revenue;
        for (const [id, name] of b.excludedChannels) excludedChannelsMap.set(id, name);
      }
    }
    const excludedChannels = [...excludedChannelsMap.entries()].map(([id, name]) => ({ id, name }));

    let alreadyBookedRemaining = 0;
    for (const vid of villaIdsInScope) {
      const dateMap = occupancyRemaining.get(vid);
      if (!dateMap) continue;
      for (const n of dateMap.values()) alreadyBookedRemaining += n;
    }
    const remainingAvailableRoomNights = Math.max(0, unitCount * remainingDays - alreadyBookedRemaining);

    const achievementPct = target !== null && target !== 0 ? currentlyBookedRevenue / target : null;
    const gap = target !== null ? target - currentlyBookedRevenue : null;
    const requiredRevenuePerRemainingDay = gap !== null && remainingDays > 0 ? gap / remainingDays : null;
    const requiredArrOnRemainingRn = gap !== null && remainingAvailableRoomNights > 0 ? gap / remainingAvailableRoomNights : null;

    return {
      villa,
      target,
      currentlyBookedRevenue,
      excludedChannels,
      achievementPct,
      gap,
      remainingDays,
      remainingAvailableRoomNights,
      requiredRevenuePerRemainingDay,
      requiredArrOnRemainingRn,
    };
  }

  const portfolioUnitCount = villas.reduce((s, v) => s + v.unit_count, 0);
  const portfolio = computeRow(null, portfolioUnitCount, portfolioTarget, villaIds);

  // REPORTING_LOGIC.md §8: "villas without an individually-configured
  // target show ... only where a target is present" — never fabricate one.
  const villaRows = villas
    .filter((v) => targetByVilla.has(v.id))
    .map((v) => computeRow(v, v.unit_count, targetByVilla.get(v.id) ?? null, [v.id]));

  return { range, portfolio, villaRows };
}
