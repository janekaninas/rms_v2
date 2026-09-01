import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettlementBatchStatus } from "@/lib/types";
import { deriveBatchStatus } from "./status";
import { allocateReservationNights, type NightAllocation } from "../financial/allocate";
import { loadAllocationContext } from "../financial/context";

export interface SettlementBatchSummary {
  id: string;
  channelId: string;
  channelName: string;
  batchReference: string | null;
  batchDate: string;
  netSettlementAmount: number;
  expectedTotal: number | null;
  variance: number | null;
  status: SettlementBatchStatus;
  lineCount: number;
  unresolvedLineCount: number;
}

export interface SettlementReconciliationFilters {
  channelId?: string;
  fromDate?: string;
  toDate?: string;
  status?: SettlementBatchStatus;
}

/**
 * Loads every batch (bulk-fetching lines/allocations/reservations rather
 * than one query per batch, CLAUDE.md rule 11) and computes Expected vs.
 * Settled vs. Variance vs. Status **live** from current source data —
 * REPORTING_LOGIC.md §10's calculation, not the stored `status` column
 * (which exists only so the DB can filter by status quickly; the figures
 * shown here are always freshly derived, since a reservation's
 * expected_settlement_amount can change after the batch was committed).
 */
export async function loadSettlementBatches(
  supabase: SupabaseClient,
  filters: SettlementReconciliationFilters = {},
): Promise<SettlementBatchSummary[]> {
  let query = supabase
    .from("ota_settlement_batches")
    .select("id, channel_id, batch_reference, batch_date, net_settlement_amount")
    .order("batch_date", { ascending: false });

  if (filters.channelId) query = query.eq("channel_id", filters.channelId);
  if (filters.fromDate) query = query.gte("batch_date", filters.fromDate);
  if (filters.toDate) query = query.lte("batch_date", filters.toDate);

  const { data: batchRows } = await query;
  const batches = batchRows ?? [];
  if (batches.length === 0) return [];

  const batchIds = batches.map((b) => b.id as string);

  const { data: channelRows } = await supabase.from("channels").select("id, display_name");
  const channelNameById = new Map((channelRows ?? []).map((c) => [c.id as string, c.display_name as string]));

  const { data: lineRows } = await supabase
    .from("ota_settlement_lines")
    .select("id, batch_id, line_type, raw_reservation_reference")
    .in("batch_id", batchIds);
  const lines = lineRows ?? [];
  const lineIds = lines.map((l) => l.id as string);

  const { data: allocationRows } = await supabase
    .from("settlement_reservation_allocations")
    .select("settlement_line_id, reservation_id")
    .in("settlement_line_id", lineIds.length > 0 ? lineIds : ["00000000-0000-0000-0000-000000000000"]);
  const allocations = allocationRows ?? [];

  const reservationIds = [...new Set(allocations.map((a) => a.reservation_id as string))];
  const { data: reservationRows } = await supabase
    .from("reservations")
    .select("id, expected_settlement_amount")
    .in("id", reservationIds.length > 0 ? reservationIds : ["00000000-0000-0000-0000-000000000000"]);
  const expectedByReservation = new Map(
    (reservationRows ?? []).map((r) => [r.id as string, r.expected_settlement_amount as number | null]),
  );

  const linesByBatch = new Map<string, typeof lines>();
  for (const l of lines) {
    const list = linesByBatch.get(l.batch_id as string) ?? [];
    list.push(l);
    linesByBatch.set(l.batch_id as string, list);
  }
  const allocationsByLine = new Map<string, string[]>();
  for (const a of allocations) {
    const list = allocationsByLine.get(a.settlement_line_id as string) ?? [];
    list.push(a.reservation_id as string);
    allocationsByLine.set(a.settlement_line_id as string, list);
  }

  const summaries: SettlementBatchSummary[] = batches.map((b) => {
    const batchLines = linesByBatch.get(b.id as string) ?? [];
    const allocatedReservationIds = new Set<string>();
    for (const l of batchLines) {
      for (const rid of allocationsByLine.get(l.id as string) ?? []) allocatedReservationIds.add(rid);
    }

    const unresolvedLineCount = batchLines.filter(
      (l) => l.line_type === "BOOKING_PAYOUT" && l.raw_reservation_reference && !allocationsByLine.has(l.id as string),
    ).length;

    // null (not 0) when nothing is allocated yet — "not yet determined" is
    // a different state from "determined to be zero," and collapsing them
    // would show a misleading Expected/Variance figure on a PENDING batch.
    let expectedTotal: number | null = allocatedReservationIds.size > 0 ? 0 : null;
    for (const rid of allocatedReservationIds) {
      const amount = expectedByReservation.get(rid) ?? null;
      if (amount === null) {
        expectedTotal = null;
        break;
      }
      expectedTotal = (expectedTotal as number) + amount;
    }

    const netSettlementAmount = b.net_settlement_amount as number;
    const status = deriveBatchStatus({
      unresolvedLineCount,
      hasAnyAllocation: allocatedReservationIds.size > 0,
      expectedTotal,
      netSettlementAmount,
    });

    return {
      id: b.id as string,
      channelId: b.channel_id as string,
      channelName: channelNameById.get(b.channel_id as string) ?? "—",
      batchReference: b.batch_reference as string | null,
      batchDate: b.batch_date as string,
      netSettlementAmount,
      expectedTotal,
      variance: expectedTotal === null ? null : expectedTotal - netSettlementAmount,
      status,
      lineCount: batchLines.length,
      unresolvedLineCount,
    };
  });

  return filters.status ? summaries.filter((s) => s.status === filters.status) : summaries;
}

export interface SettlementLineDetail {
  id: string;
  lineType: string;
  rawReservationReference: string | null;
  description: string | null;
  amount: number;
  matchedStatus: string;
  allocatedReservation: {
    id: string;
    reservationNumber: string;
    guestName: string | null;
    channelId: string;
    channelName: string | null;
    villaLabel: string | null;
    arrivalDate: string;
    departureDate: string;
    nights: number;
    status: string;
    expectedSettlementAmount: number | null;
    /** For the shared ReservationDrilldown sheet — its own full nightly financial breakdown. */
    nightAllocations: NightAllocation[];
    hasApprovedOverride: boolean;
  } | null;
}

export interface SettlementBatchDetail {
  id: string;
  channelId: string;
  channelName: string;
  batchReference: string | null;
  batchDate: string;
  grossSettlementAmount: number;
  adjustmentAmount: number;
  netSettlementAmount: number;
  lines: SettlementLineDetail[];
}

/** Drill-down for one batch: its lines, and each line's allocated
 * reservation with enough detail to open the shared ReservationDrilldown
 * (REPORTING_LOGIC.md §10: "batch -> its lines -> each line's allocated
 * reservation(s) -> that reservation's full financial breakdown"). */
export async function loadSettlementBatchDetail(
  supabase: SupabaseClient,
  batchId: string,
): Promise<SettlementBatchDetail | null> {
  const { data: batch } = await supabase
    .from("ota_settlement_batches")
    .select("id, channel_id, batch_reference, batch_date, gross_settlement_amount, adjustment_amount, net_settlement_amount")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return null;

  const { data: channelRows } = await supabase.from("channels").select("id, display_name");
  const channelNameById = new Map((channelRows ?? []).map((c) => [c.id as string, c.display_name as string]));

  const { data: lineRows } = await supabase
    .from("ota_settlement_lines")
    .select("id, line_type, raw_reservation_reference, description, amount, matched_status")
    .eq("batch_id", batchId)
    .order("created_at");
  const lines = lineRows ?? [];

  const { data: allocationRows } = await supabase
    .from("settlement_reservation_allocations")
    .select("settlement_line_id, reservation_id")
    .in("settlement_line_id", lines.length > 0 ? lines.map((l) => l.id) : ["00000000-0000-0000-0000-000000000000"]);
  const allocations = allocationRows ?? [];
  const reservationIdByLine = new Map(allocations.map((a) => [a.settlement_line_id as string, a.reservation_id as string]));

  const reservationIds = [...new Set(allocations.map((a) => a.reservation_id as string))];
  const { data: reservationRows } = await supabase
    .from("reservations")
    .select(
      "id, reservation_number, guest_name, channel_id, villa_id, arrival_date, departure_date, nights, status, expected_settlement_amount, system_gross_revenue, final_gross_revenue",
    )
    .in("id", reservationIds.length > 0 ? reservationIds : ["00000000-0000-0000-0000-000000000000"]);
  const reservationById = new Map((reservationRows ?? []).map((r) => [r.id as string, r]));

  const villaIds = [...new Set((reservationRows ?? []).map((r) => r.villa_id as string | null).filter((v): v is string => Boolean(v)))];
  const { data: villaRows } = await supabase.from("villas").select("id, villa_code, name").in("id", villaIds.length > 0 ? villaIds : ["00000000-0000-0000-0000-000000000000"]);
  const villaLabelById = new Map((villaRows ?? []).map((v) => [v.id as string, `${v.villa_code} — ${v.name}`]));

  // For the shared ReservationDrilldown sheet (all-bookings' pattern):
  // each allocated reservation's own full nightly financial breakdown.
  const channelIds = [...new Set((reservationRows ?? []).map((r) => r.channel_id as string))];
  const [{ data: dailyRows }, { data: overrideRows }, allocationContext] = await Promise.all([
    supabase
      .from("daily_revenue")
      .select("reservation_id, stay_date, commercial_revenue_basis_amount")
      .in("reservation_id", reservationIds.length > 0 ? reservationIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("revenue_type", "STAY"),
    supabase
      .from("revenue_overrides")
      .select("reservation_id")
      .in("reservation_id", reservationIds.length > 0 ? reservationIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "APPROVED"),
    loadAllocationContext(supabase, villaIds, channelIds),
  ]);
  const actualByReservation = new Map<string, { stayDate: string; amount: number }[]>();
  for (const row of dailyRows ?? []) {
    const list = actualByReservation.get(row.reservation_id as string) ?? [];
    list.push({ stayDate: row.stay_date as string, amount: row.commercial_revenue_basis_amount as number });
    actualByReservation.set(row.reservation_id as string, list);
  }
  const approvedOverrideReservations = new Set((overrideRows ?? []).map((o) => o.reservation_id as string));

  return {
    id: batch.id as string,
    channelId: batch.channel_id as string,
    channelName: channelNameById.get(batch.channel_id as string) ?? "—",
    batchReference: batch.batch_reference as string | null,
    batchDate: batch.batch_date as string,
    grossSettlementAmount: batch.gross_settlement_amount as number,
    adjustmentAmount: batch.adjustment_amount as number,
    netSettlementAmount: batch.net_settlement_amount as number,
    lines: lines.map((l) => {
      const reservationId = reservationIdByLine.get(l.id as string);
      const r = reservationId ? reservationById.get(reservationId) : null;
      return {
        id: l.id as string,
        lineType: l.line_type as string,
        rawReservationReference: l.raw_reservation_reference as string | null,
        description: l.description as string | null,
        amount: l.amount as number,
        matchedStatus: l.matched_status as string,
        allocatedReservation: r
          ? {
              id: r.id as string,
              reservationNumber: r.reservation_number as string,
              guestName: r.guest_name as string | null,
              channelId: r.channel_id as string,
              channelName: channelNameById.get(r.channel_id as string) ?? null,
              villaLabel: r.villa_id ? villaLabelById.get(r.villa_id as string) ?? null : null,
              arrivalDate: r.arrival_date as string,
              departureDate: r.departure_date as string,
              nights: r.nights as number,
              status: r.status as string,
              expectedSettlementAmount: r.expected_settlement_amount as number | null,
              nightAllocations: allocateReservationNights({
                arrivalDate: r.arrival_date as string,
                departureDate: r.departure_date as string,
                authoritativeTotal: (r.final_gross_revenue as number | null) ?? (r.system_gross_revenue as number | null) ?? null,
                actualRows: actualByReservation.get(r.id as string) ?? [],
                channelId: r.channel_id as string,
                villaId: r.villa_id as string | null,
                villaGroupId: r.villa_id ? allocationContext.villaGroupByVilla.get(r.villa_id as string) ?? null : null,
                rules: allocationContext.rules,
                assignments: allocationContext.assignments,
                profiles: allocationContext.profiles,
              }).nights,
              hasApprovedOverride: approvedOverrideReservations.has(r.id as string),
            }
          : null,
      };
    }),
  };
}
