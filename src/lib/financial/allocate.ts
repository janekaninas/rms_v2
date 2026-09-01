import { resolveChannelPaymentRule, resolveTaxProfile } from "./resolve";
import { computeNightlyRevenue } from "./compute";
import type { ChannelPaymentRuleRow, TaxProfileAssignmentRow, TaxProfileRow } from "./types";

export interface NightAllocation {
  stayDate: string;
  amount: number;
  /** True = a real Room Revenue Breakdown row (or an approved override's regenerated even-split row); false = the query-time Estimated Remaining Night Rate — never persisted as its own daily_revenue row. */
  isActual: boolean;
  commission: number | null;
  commissionVat: number | null;
  serviceChargeExtraction: number | null;
  pb1: number | null;
  netRevenue: number | null;
  expectedSettlementContribution: number | null;
  ruleId: string | null;
}

export interface ReservationAllocation {
  nights: NightAllocation[];
  missingPaymentRule: boolean;
  /** True once every stay-date has an actual row — the point at which a total mismatch becomes checkable. */
  allActual: boolean;
  actualSum: number;
  totalExpectedSettlement: number | null;
  totalNetRevenue: number | null;
}

function enumerateStayDates(arrival: string, departure: string): string[] {
  const dates: string[] = [];
  const cur = new Date(arrival);
  const end = new Date(departure);
  while (cur < end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * FINANCIAL_LOGIC.md §7a: the confirmed nightly allocation for a
 * reservation. The Booking/Arrival Report total (or an approved
 * override's total) is fixed and authoritative; any stay-date without
 * an actual row yet takes an equal share of whatever's left —
 * `(authoritativeTotal - actualSum) / unresolvedNights` — recomputed
 * fresh every call, never persisted for the unresolved nights
 * themselves (same query-time-only principle as `ESTIMATED_BOOKED`,
 * DATA_MODEL.md §9).
 */
export function allocateReservationNights(params: {
  arrivalDate: string;
  departureDate: string;
  authoritativeTotal: number | null;
  actualRows: { stayDate: string; amount: number }[];
  channelId: string | null;
  villaId: string | null;
  villaGroupId: string | null;
  rules: ChannelPaymentRuleRow[];
  assignments: TaxProfileAssignmentRow[];
  profiles: TaxProfileRow[];
}): ReservationAllocation {
  const {
    arrivalDate,
    departureDate,
    authoritativeTotal,
    actualRows,
    channelId,
    villaId,
    villaGroupId,
    rules,
    assignments,
    profiles,
  } = params;

  const allStayDates = enumerateStayDates(arrivalDate, departureDate);
  const actualByDate = new Map(actualRows.map((r) => [r.stayDate, r.amount]));
  const actualSum = actualRows.reduce((s, r) => s + r.amount, 0);
  const unresolvedDates = allStayDates.filter((d) => !actualByDate.has(d));
  const remaining = (authoritativeTotal ?? 0) - actualSum;
  const estimatedPerNight = unresolvedDates.length > 0 ? remaining / unresolvedDates.length : 0;

  let missingPaymentRule = false;
  let totalExpectedSettlement = 0;
  let totalNetRevenue = 0;

  const nights: NightAllocation[] = allStayDates.map((stayDate) => {
    const isActual = actualByDate.has(stayDate);
    const amount = isActual ? (actualByDate.get(stayDate) as number) : estimatedPerNight;

    if (!channelId || !villaId) {
      missingPaymentRule = true;
      return {
        stayDate,
        amount,
        isActual,
        commission: null,
        commissionVat: null,
        serviceChargeExtraction: null,
        pb1: null,
        netRevenue: null,
        expectedSettlementContribution: null,
        ruleId: null,
      };
    }

    const rule = resolveChannelPaymentRule(rules, channelId, villaId, villaGroupId, stayDate);
    const taxProfile = resolveTaxProfile(assignments, profiles, villaId, stayDate);
    if (!rule || !taxProfile) {
      missingPaymentRule = true;
      return {
        stayDate,
        amount,
        isActual,
        commission: null,
        commissionVat: null,
        serviceChargeExtraction: null,
        pb1: null,
        netRevenue: null,
        expectedSettlementContribution: null,
        ruleId: null,
      };
    }

    const result = computeNightlyRevenue(amount, rule, taxProfile);
    totalExpectedSettlement += result.expectedSettlementContribution;
    totalNetRevenue += result.netRevenue;
    return {
      stayDate,
      amount,
      isActual,
      commission: result.commission,
      commissionVat: result.commissionVat,
      serviceChargeExtraction: result.serviceChargeExtraction,
      pb1: result.pb1,
      netRevenue: result.netRevenue,
      expectedSettlementContribution: result.expectedSettlementContribution,
      ruleId: result.ruleId,
    };
  });

  return {
    nights,
    missingPaymentRule,
    allActual: unresolvedDates.length === 0,
    actualSum,
    totalExpectedSettlement: missingPaymentRule ? null : totalExpectedSettlement,
    totalNetRevenue: missingPaymentRule ? null : totalNetRevenue,
  };
}
