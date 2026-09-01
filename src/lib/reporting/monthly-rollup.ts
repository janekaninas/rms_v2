import type { SupabaseClient } from "@supabase/supabase-js";
import type { Villa } from "@/lib/types";
import { getMonthRange, getVillasForPeriod, listDatesInMonth, managedDaysInMonth, type MonthRange } from "./period";
import { computeOccupancyByVillaDate, type OccupancyReservation } from "./occupancy";

export interface MonthlyPerformanceData {
  range: MonthRange;
  dates: string[];
  aasha: Villa[];
  balinest: Villa[];
  occupancyByVilla: Map<string, Map<string, number>>;
  revenueByVilla: Map<string, Map<string, { sum: number; hasIncomplete: boolean }>>;
}

/**
 * The one query set behind both Monthly Performance's per-villa-per-date
 * matrix and Summary's per-portfolio-per-month rollup — REPORTING_LOGIC.md
 * §3 is explicit that Summary must not diverge from Monthly Performance's
 * calculation, so both read from this same function rather than each
 * re-deriving occupancy/revenue independently.
 */
export async function loadMonthlyPerformanceData(
  supabase: SupabaseClient,
  year: number,
  month: number,
): Promise<MonthlyPerformanceData> {
  const range = getMonthRange(year, month);
  const dates = listDatesInMonth(range);
  const { aasha, balinest } = await getVillasForPeriod(supabase, range);
  const villaIds = [...aasha, ...balinest].map((v) => v.id);

  const [{ data: reservations }, { data: dailyRows }] = villaIds.length
    ? await Promise.all([
        supabase
          .from("reservations")
          .select("id, villa_id, arrival_date, departure_date, status")
          .in("villa_id", villaIds)
          .lt("arrival_date", range.endExclusive)
          .gt("departure_date", range.start),
        supabase
          .from("daily_revenue")
          .select("villa_id, stay_date, net_revenue")
          .in("villa_id", villaIds)
          .eq("revenue_type", "STAY")
          .gte("stay_date", range.start)
          .lte("stay_date", range.endInclusive),
      ])
    : [{ data: [] }, { data: [] }];

  const occupancyByVilla = computeOccupancyByVillaDate((reservations ?? []) as OccupancyReservation[], dates);

  const revenueByVilla = new Map<string, Map<string, { sum: number; hasIncomplete: boolean }>>();
  for (const row of dailyRows ?? []) {
    const villaId = row.villa_id as string | null;
    if (!villaId) continue;
    let dateMap = revenueByVilla.get(villaId);
    if (!dateMap) {
      dateMap = new Map();
      revenueByVilla.set(villaId, dateMap);
    }
    const stayDate = row.stay_date as string;
    const existing = dateMap.get(stayDate) ?? { sum: 0, hasIncomplete: false };
    if (row.net_revenue === null) {
      existing.hasIncomplete = true;
    } else {
      existing.sum += row.net_revenue as number;
    }
    dateMap.set(stayDate, existing);
  }

  return { range, dates, aasha, balinest, occupancyByVilla, revenueByVilla };
}

export interface VillaMonthlyRollup {
  villa: Villa;
  roomNightsSold: number;
  availableRoomNights: number;
  occupancyPct: number | null;
  arr: number | null;
  monthlyNetRevenue: number;
  incompleteCount: number;
}

/** REPORTING_LOGIC.md §2b's four per-villa rollup figures. */
export function rollupVilla(villa: Villa, data: MonthlyPerformanceData): VillaMonthlyRollup {
  const occDates = data.occupancyByVilla.get(villa.id);
  const revDates = data.revenueByVilla.get(villa.id);
  let roomNightsSold = 0;
  let monthlyNetRevenue = 0;
  let incompleteCount = 0;
  for (const date of data.dates) {
    roomNightsSold += occDates?.get(date) ?? 0;
    const rev = revDates?.get(date);
    if (rev) {
      monthlyNetRevenue += rev.sum;
      if (rev.hasIncomplete) incompleteCount++;
    }
  }
  const managedDays = managedDaysInMonth(villa, data.range);
  const availableRoomNights = villa.unit_count * managedDays;
  const occupancyPct = availableRoomNights > 0 ? roomNightsSold / availableRoomNights : null;
  const arr = roomNightsSold > 0 ? monthlyNetRevenue / roomNightsSold : null;
  return { villa, roomNightsSold, availableRoomNights, occupancyPct, arr, monthlyNetRevenue, incompleteCount };
}

export interface PortfolioMonthlyRollup {
  roomNightsSold: number;
  occupancyPct: number | null;
  arr: number | null;
  monthlyNetRevenue: number;
  incompleteVillaCount: number;
}

/**
 * Sums villa-level rollups into one portfolio figure — occupancy % is
 * sum(room nights sold) / sum(available room nights), never an average of
 * per-villa percentages, so a mix of large and small villas weights
 * correctly.
 */
export function aggregateRollups(rollups: VillaMonthlyRollup[]): PortfolioMonthlyRollup {
  let roomNightsSold = 0;
  let availableRoomNights = 0;
  let monthlyNetRevenue = 0;
  let incompleteVillaCount = 0;
  for (const r of rollups) {
    roomNightsSold += r.roomNightsSold;
    availableRoomNights += r.availableRoomNights;
    monthlyNetRevenue += r.monthlyNetRevenue;
    if (r.incompleteCount > 0) incompleteVillaCount++;
  }
  return {
    roomNightsSold,
    occupancyPct: availableRoomNights > 0 ? roomNightsSold / availableRoomNights : null,
    arr: roomNightsSold > 0 ? monthlyNetRevenue / roomNightsSold : null,
    monthlyNetRevenue,
    incompleteVillaCount,
  };
}
