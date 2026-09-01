import type { SupabaseClient } from "@supabase/supabase-js";
import { allocateReservationNights } from "./allocate";
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

// A rounding-only tolerance — not a business rule to relax further
// without sign-off (REPORTING_LOGIC.md §10 uses the same convention for
// settlement variance).
const MISMATCH_TOLERANCE = 1;

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
 * Recomputes the confirmed nightly allocation (FINANCIAL_LOGIC.md §7a)
 * and commission/VAT/PB1/net revenue for every reservation given, and
 * rolls each one's Expected Settlement up from its nights. Batches all
 * reads and writes across the whole set rather than per-reservation
 * (IMPORT_LOGIC.md §7's bulk-operation requirement) — call this once per
 * import/override-approval with every affected reservation id, not once
 * per reservation. Safe (and necessary) to call for a reservation with
 * zero actual Room Revenue rows yet — that's the "before Room Revenue
 * Breakdown exists" case, not a no-op.
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

  // FINANCIAL_LOGIC.md §7a-B: an approved override is authoritative for
  // both the total and the (even-split) nightly allocation — regenerate
  // the STAY rows first so the allocation pass below sees them as fully
  // resolved/actual, needing no estimation at all.
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
    .in("reservation_id", reservationIds)
    .eq("revenue_type", "STAY");
  const dailyByReservation = new Map<string, DailyRevenueRow[]>();
  for (const row of (dailyRows ?? []) as DailyRevenueRow[]) {
    const list = dailyByReservation.get(row.reservation_id) ?? [];
    list.push(row);
    dailyByReservation.set(row.reservation_id, list);
  }

  const channelIds = [...new Set(reservationList.map((r) => r.channel_id).filter((v): v is string => v !== null))];
  const villaIds = [...new Set(reservationList.map((r) => r.villa_id).filter((v): v is string => v !== null))];

  const [{ data: villas }, { data: channels }, { data: rules }, { data: assignments }, { data: profiles }] =
    await Promise.all([
      villaIds.length
        ? supabase.from("villas").select("id, villa_group_id").in("id", villaIds)
        : Promise.resolve({ data: [] }),
      channelIds.length
        ? supabase.from("channels").select("id, channel_type").in("id", channelIds)
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
  const channelTypeByChannel = new Map((channels ?? []).map((c) => [c.id as string, c.channel_type as string]));
  const ruleList = (rules ?? []) as ChannelPaymentRuleRow[];
  const assignmentList = (assignments ?? []) as TaxProfileAssignmentRow[];
  const profileList = (profiles ?? []) as TaxProfileRow[];

  const dailyRevenueUpserts: Record<string, unknown>[] = [];
  const reservationUpdates: {
    id: string;
    expected_settlement_amount: number | null;
    expected_settlement_rule_id: string | null;
    final_gross_revenue: number | null;
  }[] = [];
  const missingRuleIds: string[] = [];
  const resolvedRuleIds: string[] = [];
  const needsOverrideReviewIds: string[] = [];
  const overrideReviewResolvedIds: string[] = [];
  const mismatchIds: { id: string; detail: Record<string, unknown> }[] = [];
  const mismatchResolvedIds: string[] = [];

  for (const res of reservationList) {
    const hasApprovedOverride = approvedOverrideByReservation.has(res.id);
    const authoritativeTotal = hasApprovedOverride
      ? (approvedOverrideByReservation.get(res.id) as number)
      : (res.system_gross_revenue ?? null);

    const rows = dailyByReservation.get(res.id) ?? [];
    const actualRows = rows.map((r) => ({ stayDate: r.stay_date, amount: r.commercial_revenue_basis_amount }));

    const allocation = allocateReservationNights({
      arrivalDate: res.arrival_date,
      departureDate: res.departure_date,
      authoritativeTotal,
      actualRows,
      channelId: res.channel_id,
      villaId: res.villa_id,
      villaGroupId: res.villa_id ? (villaGroupByVilla.get(res.villa_id) ?? null) : null,
      rules: ruleList,
      assignments: assignmentList,
      profiles: profileList,
    });

    // Persist only the nights that already have a real daily_revenue row
    // (actual Room Revenue Breakdown, or the just-regenerated override
    // even-split) — an estimated night is never written as its own row
    // (FINANCIAL_LOGIC.md §7a, DATA_MODEL.md §9).
    const rowByDate = new Map(rows.map((r) => [r.stay_date, r]));
    for (const night of allocation.nights) {
      if (!night.isActual) continue;
      const row = rowByDate.get(night.stayDate);
      if (!row) continue;
      dailyRevenueUpserts.push({
        id: row.id,
        reservation_id: row.reservation_id,
        villa_id: row.villa_id,
        stay_date: row.stay_date,
        revenue_type: row.revenue_type,
        commercial_revenue_basis_amount: row.commercial_revenue_basis_amount,
        commission: night.commission,
        commission_vat: night.commissionVat,
        service_charge_extraction: night.serviceChargeExtraction,
        pb1: night.pb1,
        net_revenue: night.netRevenue,
      });
    }

    reservationUpdates.push({
      id: res.id,
      expected_settlement_amount: allocation.totalExpectedSettlement,
      expected_settlement_rule_id: allocation.nights.find((n) => n.ruleId)?.ruleId ?? null,
      final_gross_revenue: authoritativeTotal,
    });

    if (allocation.missingPaymentRule) {
      missingRuleIds.push(res.id);
    } else {
      resolvedRuleIds.push(res.id);
    }

    // FINANCIAL_LOGIC.md §7a-B/C: Direct/Individual/Travel-Agent figures
    // are only provisional until a manual override is approved.
    const channelType = res.channel_id ? channelTypeByChannel.get(res.channel_id) : null;
    if (!hasApprovedOverride && (channelType === "DIRECT" || channelType === "TRAVEL_AGENT")) {
      needsOverrideReviewIds.push(res.id);
    } else {
      overrideReviewResolvedIds.push(res.id);
    }

    // FINANCIAL_LOGIC.md §7a-A: once every night is actual, the
    // authoritative total must reconcile to their sum — flagged, never
    // silently replaced. Never fires for an approved override, since its
    // regenerated rows sum to the override total by construction.
    if (
      allocation.allActual &&
      !allocation.missingPaymentRule &&
      authoritativeTotal !== null &&
      Math.abs(allocation.actualSum - authoritativeTotal) > MISMATCH_TOLERANCE
    ) {
      mismatchIds.push({
        id: res.id,
        detail: { authoritativeTotal, actualSum: allocation.actualSum },
      });
    } else {
      mismatchResolvedIds.push(res.id);
    }
  }

  if (dailyRevenueUpserts.length > 0) {
    const byId = new Map(dailyRevenueUpserts.map((u) => [u.id as string, u]));
    await supabase.from("daily_revenue").upsert(Array.from(byId.values()), { onConflict: "id" });
  }

  // One update per reservation rather than a bulk upsert: reservations
  // has many other NOT NULL columns that would all have to be
  // re-included just to satisfy a partial-column upsert's insert-path
  // validation, and the reservation count per batch is far smaller than
  // the nightly daily_revenue row count.
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

  await syncExceptions(supabase, "MISSING_PAYMENT_RULE", missingRuleIds, resolvedRuleIds);
  await syncExceptions(supabase, "MANUAL_REVENUE_OVERRIDE_PENDING", needsOverrideReviewIds, overrideReviewResolvedIds);
  await syncMismatchExceptions(supabase, mismatchIds, mismatchResolvedIds);
}

/** Opens an exception (deduped against any already-open one) for each id in `toOpen`, and resolves any open one for each id in `toResolve`. */
async function syncExceptions(
  supabase: SupabaseClient,
  type: string,
  toOpen: string[],
  toResolve: string[],
) {
  if (toOpen.length > 0) {
    const { data: existingOpen } = await supabase
      .from("reconciliation_exceptions")
      .select("reservation_id")
      .in("reservation_id", toOpen)
      .eq("type", type)
      .eq("status", "OPEN");
    const alreadyOpen = new Set((existingOpen ?? []).map((e) => e.reservation_id as string));
    const toInsert = toOpen
      .filter((id) => !alreadyOpen.has(id))
      .map((id) => ({ type, reservation_id: id, detail: {} }));
    if (toInsert.length > 0) {
      await supabase.from("reconciliation_exceptions").insert(toInsert);
    }
  }
  if (toResolve.length > 0) {
    await supabase
      .from("reconciliation_exceptions")
      .update({
        status: "RESOLVED",
        resolved_at: new Date().toISOString(),
        resolution_notes: "Auto-resolved: condition no longer holds on recompute.",
      })
      .in("reservation_id", toResolve)
      .eq("type", type)
      .eq("status", "OPEN");
  }
}

async function syncMismatchExceptions(
  supabase: SupabaseClient,
  toOpen: { id: string; detail: Record<string, unknown> }[],
  toResolve: string[],
) {
  if (toOpen.length > 0) {
    const ids = toOpen.map((x) => x.id);
    const { data: existingOpen } = await supabase
      .from("reconciliation_exceptions")
      .select("reservation_id")
      .in("reservation_id", ids)
      .eq("type", "ROOM_REVENUE_TOTAL_MISMATCH")
      .eq("status", "OPEN");
    const alreadyOpen = new Set((existingOpen ?? []).map((e) => e.reservation_id as string));
    const toInsert = toOpen
      .filter((x) => !alreadyOpen.has(x.id))
      .map((x) => ({ type: "ROOM_REVENUE_TOTAL_MISMATCH", reservation_id: x.id, detail: x.detail }));
    if (toInsert.length > 0) {
      await supabase.from("reconciliation_exceptions").insert(toInsert);
    }
  }
  if (toResolve.length > 0) {
    await supabase
      .from("reconciliation_exceptions")
      .update({
        status: "RESOLVED",
        resolved_at: new Date().toISOString(),
        resolution_notes: "Auto-resolved: totals now reconcile on recompute.",
      })
      .in("reservation_id", toResolve)
      .eq("type", "ROOM_REVENUE_TOTAL_MISMATCH")
      .eq("status", "OPEN");
  }
}
