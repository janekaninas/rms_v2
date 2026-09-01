import type { SupabaseClient } from "@supabase/supabase-js";
import type { Villa } from "@/lib/types";
import { allocateReservationNights } from "@/lib/financial/allocate";
import { loadAllocationContext } from "@/lib/financial/context";
import { getMonthRange, getVillasForPeriod, listDatesInMonth, managedDaysInMonth, type MonthRange } from "./period";
import { computeOccupancyByVillaDate, type OccupancyReservation } from "./occupancy";

export interface CellRevenue {
  commercialRevenue: number;
  commission: number;
  commissionVat: number;
  serviceChargeExtraction: number;
  pb1: number;
  netRevenue: number;
  /** Every contributing reservation-night is an actual Room Revenue row. */
  allActual: boolean;
  /**
   * At least one contributing reservation has no booking total at all — a
   * data/import problem, informational only. Distinct from
   * missingRuleChannels below: allocateReservationNights() computes a real
   * (if degenerate) netRevenue for a no-total-but-resolved-rule night, so
   * this never excludes anything from the netRevenue sum on its own.
   */
  missingTotal: boolean;
  /**
   * channelId -> channel display name, for every distinct channel with an
   * open MISSING_PAYMENT_RULE (no channel_payment_rules row resolves) among
   * this cell's contributing reservation-nights — the genuinely fixable
   * case, unlike missingTotal above. Non-empty size is what actually
   * excludes a night's amount from netRevenue (night.netRevenue === null).
   */
  missingRuleChannels: Map<string, string>;
}

export interface MonthlyPerformanceData {
  range: MonthRange;
  dates: string[];
  aasha: Villa[];
  balinest: Villa[];
  occupancyByVilla: Map<string, Map<string, number>>;
  revenueByVilla: Map<string, Map<string, CellRevenue>>;
}

/**
 * FINANCIAL_LOGIC.md §7a / REPORTING_LOGIC.md §2a (corrected): revenue is
 * available the moment a reservation's Booking/Arrival Report total is
 * known — every occupied night uses allocateReservationNights()'s actual
 * (if a Room Revenue Breakdown row exists) or estimated (progressive
 * remaining-revenue / approved-override even-split) figure, never a raw
 * daily_revenue sum that stays blank until an import happens. This is the
 * one query set behind both Monthly Performance's matrix and Summary's
 * rollup (§3) — both read from here so they can never diverge.
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

  const [{ data: reservationRows }, { data: channelRows }] = await Promise.all([
    villaIds.length
      ? supabase
          .from("reservations")
          .select("id, villa_id, channel_id, arrival_date, departure_date, status, system_gross_revenue, final_gross_revenue")
          .in("villa_id", villaIds)
          .lt("arrival_date", range.endExclusive)
          .gt("departure_date", range.start)
      : Promise.resolve({ data: [] }),
    // Small, portfolio-wide table — one fetch, not scoped per reservation,
    // so an "Incomplete" cell can always name its channel(s).
    supabase.from("channels").select("id, display_name"),
  ]);
  const allReservations = reservationRows ?? [];
  const channelNameById = new Map((channelRows ?? []).map((c) => [c.id as string, c.display_name as string]));

  const occupancyByVilla = computeOccupancyByVillaDate(allReservations as OccupancyReservation[], dates);

  const activeReservations = allReservations.filter((r) => r.status === "ACTIVE" && r.villa_id);
  const reservationIds = activeReservations.map((r) => r.id);
  const channelIds = [...new Set(activeReservations.map((r) => r.channel_id).filter((v): v is string => v !== null))];

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

  const revenueByVilla = new Map<string, Map<string, CellRevenue>>();
  for (const r of activeReservations) {
    const villaId = r.villa_id as string;
    const authoritativeTotal = r.final_gross_revenue ?? r.system_gross_revenue ?? null;
    const allocation = allocateReservationNights({
      arrivalDate: r.arrival_date,
      departureDate: r.departure_date,
      authoritativeTotal,
      actualRows: actualByReservation.get(r.id) ?? [],
      channelId: r.channel_id,
      villaId,
      villaGroupId: allocationContext.villaGroupByVilla.get(villaId) ?? null,
      rules: allocationContext.rules,
      assignments: allocationContext.assignments,
      profiles: allocationContext.profiles,
    });

    let dateMap = revenueByVilla.get(villaId);
    if (!dateMap) {
      dateMap = new Map();
      revenueByVilla.set(villaId, dateMap);
    }

    for (const night of allocation.nights) {
      if (night.stayDate < range.start || night.stayDate > range.endInclusive) continue;
      const existing = dateMap.get(night.stayDate) ?? {
        commercialRevenue: 0,
        commission: 0,
        commissionVat: 0,
        serviceChargeExtraction: 0,
        pb1: 0,
        netRevenue: 0,
        allActual: true,
        missingTotal: false,
        missingRuleChannels: new Map<string, string>(),
      };
      existing.commercialRevenue += night.amount;
      if (night.netRevenue === null) {
        // The genuine MISSING_PAYMENT_RULE case (or an unresolved channel/
        // villa) — not the same as "no booking total" (FINANCIAL_LOGIC.md
        // §7a-D): allocateReservationNights() still computes a real
        // netRevenue for a no-total-but-resolved-rule night.
        if (r.channel_id) {
          existing.missingRuleChannels.set(r.channel_id, channelNameById.get(r.channel_id) ?? "Unknown channel");
        }
      } else {
        existing.commission += night.commission ?? 0;
        existing.commissionVat += night.commissionVat ?? 0;
        existing.serviceChargeExtraction += night.serviceChargeExtraction ?? 0;
        existing.pb1 += night.pb1 ?? 0;
        existing.netRevenue += night.netRevenue;
      }
      if (!night.isActual) existing.allActual = false;
      if (authoritativeTotal === null) existing.missingTotal = true;
      dateMap.set(night.stayDate, existing);
    }
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
      monthlyNetRevenue += rev.netRevenue;
      if (rev.missingRuleChannels.size > 0) incompleteCount++;
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
