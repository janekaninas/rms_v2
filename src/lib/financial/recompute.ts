import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveChannelPaymentRule, resolveTaxProfile } from "./resolve";
import { computeNightlyRevenue } from "./compute";
import type { ChannelPaymentRuleRow, TaxProfileAssignmentRow, TaxProfileRow } from "./types";

interface ReservationRow {
  id: string;
  channel_id: string | null;
  villa_id: string | null;
  arrival_date: string;
  departure_date: string;
  nights: number;
  system_gross_revenue: number | null;
}

interface DailyRevenueRow {
  id: string;
  reservation_id: string;
  villa_id: string;
  stay_date: string;
  revenue_type: string;
  commercial_revenue_basis_amount: number;
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
 * Recomputes commission/VAT/service-charge-extraction/PB1/net revenue for
 * every stay-date row of the given reservations, and rolls each
 * reservation's Expected Settlement up from its nights (FINANCIAL_LOGIC.md
 * §1-§6, §11). Batches all reads and writes across the whole set rather
 * than per-reservation (IMPORT_LOGIC.md §7's bulk-operation requirement) —
 * call this once per import/override-approval with every affected
 * reservation id, not once per reservation.
 */
export async function recomputeReservations(supabase: SupabaseClient, reservationIds: string[]) {
  if (reservationIds.length === 0) return;

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id, channel_id, villa_id, arrival_date, departure_date, nights, system_gross_revenue")
    .in("id", reservationIds);
  const reservationList = (reservations ?? []) as ReservationRow[];
  if (reservationList.length === 0) return;

  const { data: overrides } = await supabase
    .from("revenue_overrides")
    .select("reservation_id, final_revenue, status")
    .in("reservation_id", reservationIds)
    .eq("status", "APPROVED");
  const approvedOverrideByReservation = new Map(
    (overrides ?? []).map((o) => [o.reservation_id as string, o.final_revenue as number]),
  );

  // Regenerate STAY rows as an even split for any reservation with an
  // approved override (FINANCIAL_LOGIC.md §7) — this file's/import's
  // actual per-night figures are not used once an override is approved.
  for (const res of reservationList) {
    const finalRevenue = approvedOverrideByReservation.get(res.id);
    if (finalRevenue === undefined) continue;

    await supabase.from("daily_revenue").delete().eq("reservation_id", res.id).eq("revenue_type", "STAY");

    const perNight = finalRevenue / (res.nights || 1);
    const stayDates = enumerateStayDates(res.arrival_date, res.departure_date);
    const rows = stayDates.map((stayDate) => ({
      reservation_id: res.id,
      villa_id: res.villa_id,
      stay_date: stayDate,
      revenue_type: "STAY" as const,
      revenue_source_status: "ACTUAL_ROOM_REVENUE" as const,
      commercial_revenue_basis_amount: perNight,
    }));
    if (rows.length > 0) {
      await supabase.from("daily_revenue").upsert(rows, { onConflict: "reservation_id,stay_date,revenue_type" });
    }
  }

  const { data: dailyRows } = await supabase
    .from("daily_revenue")
    .select("id, reservation_id, villa_id, stay_date, revenue_type, commercial_revenue_basis_amount")
    .in("reservation_id", reservationIds);
  const dailyByReservation = new Map<string, DailyRevenueRow[]>();
  for (const row of (dailyRows ?? []) as DailyRevenueRow[]) {
    const list = dailyByReservation.get(row.reservation_id) ?? [];
    list.push(row);
    dailyByReservation.set(row.reservation_id, list);
  }

  const channelIds = [...new Set(reservationList.map((r) => r.channel_id).filter((v): v is string => v !== null))];
  const villaIds = [...new Set(reservationList.map((r) => r.villa_id).filter((v): v is string => v !== null))];

  const [{ data: villas }, { data: rules }, { data: assignments }, { data: profiles }] = await Promise.all([
    villaIds.length
      ? supabase.from("villas").select("id, villa_group_id").in("id", villaIds)
      : Promise.resolve({ data: [] }),
    channelIds.length
      ? supabase.from("channel_payment_rules").select("*").in("channel_id", channelIds)
      : Promise.resolve({ data: [] }),
    villaIds.length
      ? supabase.from("villa_tax_profile_assignments").select("*").in("villa_id", villaIds)
      : Promise.resolve({ data: [] }),
    supabase.from("villa_tax_profiles").select("*"),
  ]);

  const villaGroupByVilla = new Map((villas ?? []).map((v) => [v.id as string, v.villa_group_id as string | null]));
  const ruleList = (rules ?? []) as ChannelPaymentRuleRow[];
  const assignmentList = (assignments ?? []) as TaxProfileAssignmentRow[];
  const profileList = (profiles ?? []) as TaxProfileRow[];

  const dailyRevenueUpdates: Record<string, unknown>[] = [];
  const reservationUpdates: { id: string; expected_settlement_amount: number | null; expected_settlement_rule_id: string | null; final_gross_revenue: number | null }[] = [];
  const newlyMissing: string[] = [];
  const newlyResolved: string[] = [];

  for (const res of reservationList) {
    const rows = dailyByReservation.get(res.id) ?? [];
    const finalGrossRevenue = approvedOverrideByReservation.get(res.id) ?? res.system_gross_revenue ?? null;

    if (!res.villa_id || !res.channel_id || rows.length === 0) {
      // Can't compute without a resolved villa/channel or any revenue
      // rows yet — leave incomplete, never guess (CLAUDE.md rule 20).
      reservationUpdates.push({
        id: res.id,
        expected_settlement_amount: null,
        expected_settlement_rule_id: null,
        final_gross_revenue: finalGrossRevenue,
      });
      continue;
    }

    const villaGroupId = villaGroupByVilla.get(res.villa_id) ?? null;
    let missing = false;
    let totalExpectedSettlement = 0;
    let representativeRuleId: string | null = null;

    for (const row of rows) {
      const rule = resolveChannelPaymentRule(ruleList, res.channel_id, res.villa_id, villaGroupId, row.stay_date);
      const taxProfile = resolveTaxProfile(assignmentList, profileList, res.villa_id, row.stay_date);

      if (!rule || !taxProfile) {
        missing = true;
        continue;
      }

      const result = computeNightlyRevenue(row.commercial_revenue_basis_amount, rule, taxProfile);
      if (!representativeRuleId) representativeRuleId = result.ruleId;
      totalExpectedSettlement += result.expectedSettlementContribution;

      // PostgREST's upsert still validates NOT NULL columns on the
      // insert branch even though the row is known to already exist and
      // will always take the ON CONFLICT UPDATE path — the full row
      // shape has to be included, not just the columns being changed.
      dailyRevenueUpdates.push({
        id: row.id,
        reservation_id: row.reservation_id,
        villa_id: row.villa_id,
        stay_date: row.stay_date,
        revenue_type: row.revenue_type,
        commercial_revenue_basis_amount: row.commercial_revenue_basis_amount,
        commission: result.commission,
        commission_vat: result.commissionVat,
        service_charge_extraction: result.serviceChargeExtraction,
        pb1: result.pb1,
        net_revenue: result.netRevenue,
      });
    }

    if (missing) {
      newlyMissing.push(res.id);
      // Every night for this reservation is incomplete, not just the
      // unresolved ones (CLAUDE.md rule 20) — null out anything this
      // pass may have computed for its other nights.
      for (const row of rows) {
        dailyRevenueUpdates.push({
          id: row.id,
          reservation_id: row.reservation_id,
          villa_id: row.villa_id,
          stay_date: row.stay_date,
          revenue_type: row.revenue_type,
          commercial_revenue_basis_amount: row.commercial_revenue_basis_amount,
          commission: null,
          commission_vat: null,
          service_charge_extraction: null,
          pb1: null,
          net_revenue: null,
        });
      }
      reservationUpdates.push({
        id: res.id,
        expected_settlement_amount: null,
        expected_settlement_rule_id: null,
        final_gross_revenue: finalGrossRevenue,
      });
    } else {
      newlyResolved.push(res.id);
      reservationUpdates.push({
        id: res.id,
        expected_settlement_amount: totalExpectedSettlement,
        expected_settlement_rule_id: representativeRuleId,
        final_gross_revenue: finalGrossRevenue,
      });
    }
  }

  // Bulk writes — the underlying table columns need every field present
  // per row for a partial-column upsert, so each row already carries the
  // full computed set (or the full null set) from the loop above.
  if (dailyRevenueUpdates.length > 0) {
    // Deduplicate by id (a reservation only appears once per outcome, but
    // guard against the same daily_revenue row being touched twice).
    const byId = new Map(dailyRevenueUpdates.map((u) => [u.id as string, u]));
    await supabase.from("daily_revenue").upsert(Array.from(byId.values()), { onConflict: "id" });
  }
  if (reservationUpdates.length > 0) {
    // One update per reservation rather than a bulk upsert: reservations
    // has many other NOT NULL columns (reservation_number, portfolio,
    // arrival/departure, status, ...) that would all have to be
    // re-included just to satisfy a partial-column upsert's insert-path
    // validation. The reservation count per import batch is much smaller
    // than the nightly daily_revenue row count, so this stays reasonable
    // at the documented "thousands of rows" scale (DATA_MODEL.md §9).
    for (const u of reservationUpdates) {
      await supabase
        .from("reservations")
        .update({
          expected_settlement_amount: u.expected_settlement_amount,
          expected_settlement_rule_id: u.expected_settlement_rule_id,
          final_gross_revenue: u.final_gross_revenue,
        })
        .eq("id", u.id);
    }
  }

  if (newlyMissing.length > 0) {
    const { data: existingOpen } = await supabase
      .from("reconciliation_exceptions")
      .select("reservation_id")
      .in("reservation_id", newlyMissing)
      .eq("type", "MISSING_PAYMENT_RULE")
      .eq("status", "OPEN");
    const alreadyOpen = new Set((existingOpen ?? []).map((e) => e.reservation_id as string));
    const toInsert = newlyMissing
      .filter((id) => !alreadyOpen.has(id))
      .map((id) => ({ type: "MISSING_PAYMENT_RULE", reservation_id: id, detail: {} }));
    if (toInsert.length > 0) {
      await supabase.from("reconciliation_exceptions").insert(toInsert);
    }
  }

  if (newlyResolved.length > 0) {
    await supabase
      .from("reconciliation_exceptions")
      .update({
        status: "RESOLVED",
        resolved_at: new Date().toISOString(),
        resolution_notes: "Auto-resolved: payment rule now resolves for every stay-date.",
      })
      .in("reservation_id", newlyResolved)
      .eq("type", "MISSING_PAYMENT_RULE")
      .eq("status", "OPEN");
  }
}
