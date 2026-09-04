import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedTable } from "./csv";
import type { SettlementColumnMapping } from "@/lib/types";
import type { NormalizedSettlementLine, ResolvedSettlementLine, SettlementBatchPreview, SettlementImportPreview } from "./settlement-types";
import { mapSettlementRows, mapHierarchicalSettlementRows, type HierarchicalBatchGroup } from "./parse-settlement";
import { batchDedupeHash } from "./settlement-hash";
import { buildReservationLookup, matchSettlementReservation, type ReservationCandidate } from "./settlement-match";

async function isDuplicateBatch(
  supabase: SupabaseClient,
  channelId: string,
  batchReference: string | null,
  batchDate: string,
  netAmount: number,
): Promise<boolean> {
  if (batchReference) {
    const { count } = await supabase
      .from("ota_settlement_batches")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId)
      .eq("batch_reference", batchReference);
    return (count ?? 0) > 0;
  }
  const hash = batchDedupeHash(channelId, batchDate, netAmount, "IDR");
  const { count } = await supabase
    .from("ota_settlement_batches")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", channelId)
    .eq("dedupe_hash", hash);
  return (count ?? 0) > 0;
}

function resolveLine(
  line: NormalizedSettlementLine,
  exactByNumber: Map<string, ReservationCandidate[]>,
  normalizedByNumber: Map<string, ReservationCandidate[]>,
): ResolvedSettlementLine {
  if (line.errors.length > 0 || !line.rawReservationReference) {
    return {
      line,
      matchOutcome: line.rawReservationReference ? "UNMATCHED" : "NOT_APPLICABLE",
      matchedReservationId: null,
      matchedReservationNumber: null,
      matchCandidateCount: 0,
    };
  }
  const { outcome, candidates } = matchSettlementReservation(line.rawReservationReference, exactByNumber, normalizedByNumber);
  return {
    line,
    matchOutcome: outcome,
    matchedReservationId: outcome === "MATCHED" ? candidates[0].id : null,
    matchedReservationNumber: outcome === "MATCHED" ? candidates[0].reservation_number : null,
    matchCandidateCount: candidates.length,
  };
}

export async function resolveSettlementImport(
  supabase: SupabaseClient,
  channelId: string,
  fileName: string,
  table: ParsedTable,
  mapping: SettlementColumnMapping,
): Promise<SettlementImportPreview> {
  const { data: reservationRows } = await supabase
    .from("reservations")
    .select("id, reservation_number")
    .eq("channel_id", channelId);
  const reservations = (reservationRows ?? []) as ReservationCandidate[];
  const { exactByNumber, normalizedByNumber } = buildReservationLookup(reservations);

  return mapping.mode === "HIERARCHICAL"
    ? resolveHierarchical(supabase, channelId, fileName, table, mapping, exactByNumber, normalizedByNumber)
    : resolveFlat(supabase, channelId, fileName, table, mapping, exactByNumber, normalizedByNumber);
}

async function resolveFlat(
  supabase: SupabaseClient,
  channelId: string,
  fileName: string,
  table: ParsedTable,
  mapping: SettlementColumnMapping,
  exactByNumber: Map<string, ReservationCandidate[]>,
  normalizedByNumber: Map<string, ReservationCandidate[]>,
): Promise<SettlementImportPreview> {
  const lines = mapSettlementRows(table, mapping);
  const resolvedLines = lines.map((l) => resolveLine(l, exactByNumber, normalizedByNumber));

  // Group into batches by batchReference when the mapping supplies one;
  // otherwise the whole file is one batch (IMPORT_LOGIC.md §8: "one
  // payout, or per file, if the file is naturally one payout") —
  // confirmed against the real Booking.com export, which repeats the
  // same Payout ID/date on every line of a payout.
  const byBatchRef = new Map<string, ResolvedSettlementLine[]>();
  for (const rl of resolvedLines) {
    const key = rl.line.batchReference ?? "__FILE__";
    byBatchRef.set(key, [...(byBatchRef.get(key) ?? []), rl]);
  }

  const batches: SettlementBatchPreview[] = [];
  for (const [key, groupLines] of byBatchRef) {
    const batchReference = key === "__FILE__" ? null : key;
    const validDates = groupLines.map((l) => l.line.batchDate).filter((d): d is string => Boolean(d));
    const batchDate = validDates.length > 0 ? validDates.sort().at(-1)! : new Date().toISOString().slice(0, 10);

    const grossAmount = groupLines
      .filter((l) => l.line.lineType === "BOOKING_PAYOUT")
      .reduce((sum, l) => sum + (l.line.amount ?? 0), 0);
    const adjustmentAmount = groupLines
      .filter((l) => l.line.lineType !== "BOOKING_PAYOUT")
      .reduce((sum, l) => sum + (l.line.amount ?? 0), 0);
    const netAmount = grossAmount + adjustmentAmount;

    batches.push({
      batchReference,
      batchDate,
      lines: groupLines,
      grossAmount,
      adjustmentAmount,
      netAmount,
      isDuplicateOfExistingBatch: await isDuplicateBatch(supabase, channelId, batchReference, batchDate, netAmount),
      declaredTotal: null,
      totalMismatch: false,
      unassignedErrors: [],
    });
  }

  return buildPreview(channelId, fileName, lines.length, resolvedLines, batches);
}

async function resolveHierarchical(
  supabase: SupabaseClient,
  channelId: string,
  fileName: string,
  table: ParsedTable,
  mapping: SettlementColumnMapping,
  exactByNumber: Map<string, ReservationCandidate[]>,
  normalizedByNumber: Map<string, ReservationCandidate[]>,
): Promise<SettlementImportPreview> {
  const groups: HierarchicalBatchGroup[] = mapHierarchicalSettlementRows(table, mapping);

  const allLines: NormalizedSettlementLine[] = [];
  const allResolvedLines: ResolvedSettlementLine[] = [];
  const batches: SettlementBatchPreview[] = [];

  // Rounding tolerance for the declared-total-vs-summed-lines check —
  // sub-unit only, matching the platform-wide zero-tolerance settlement
  // default (REPORTING_LOGIC.md §10).
  const TOLERANCE = 1;

  for (const group of groups) {
    const resolvedGroupLines = group.lines.map((l) => resolveLine(l, exactByNumber, normalizedByNumber));
    allLines.push(...group.lines);
    allResolvedLines.push(...resolvedGroupLines);

    if (group.lines.length === 0 && group.groupErrors.length > 0) {
      // A group with no lines at all (bad Payout row, or a stray
      // unrecognized Type row) — surface the error, don't fabricate a batch.
      batches.push({
        batchReference: group.batchReference,
        batchDate: group.batchDate ?? new Date().toISOString().slice(0, 10),
        lines: [],
        grossAmount: 0,
        adjustmentAmount: 0,
        netAmount: 0,
        isDuplicateOfExistingBatch: false,
        declaredTotal: group.declaredTotal,
        totalMismatch: false,
        unassignedErrors: group.groupErrors,
      });
      continue;
    }

    const summedAmount = resolvedGroupLines.reduce((sum, l) => sum + (l.line.amount ?? 0), 0);
    const netAmount = group.declaredTotal ?? summedAmount;
    const grossAmount = summedAmount;
    const adjustmentAmount = netAmount - grossAmount;
    const totalMismatch = group.declaredTotal !== null && Math.abs(group.declaredTotal - summedAmount) > TOLERANCE;
    const batchDate = group.batchDate ?? new Date().toISOString().slice(0, 10);

    batches.push({
      batchReference: group.batchReference,
      batchDate,
      lines: resolvedGroupLines,
      grossAmount,
      adjustmentAmount,
      netAmount,
      isDuplicateOfExistingBatch: await isDuplicateBatch(supabase, channelId, group.batchReference, batchDate, netAmount),
      declaredTotal: group.declaredTotal,
      totalMismatch,
      unassignedErrors: group.groupErrors,
    });
  }

  return buildPreview(channelId, fileName, allLines.length, allResolvedLines, batches);
}

function buildPreview(
  channelId: string,
  fileName: string,
  totalRows: number,
  resolvedLines: ResolvedSettlementLine[],
  batches: SettlementBatchPreview[],
): SettlementImportPreview {
  const counts = {
    matched: resolvedLines.filter((l) => l.matchOutcome === "MATCHED").length,
    unmatched: resolvedLines.filter((l) => l.matchOutcome === "UNMATCHED").length,
    ambiguous: resolvedLines.filter((l) => l.matchOutcome === "AMBIGUOUS").length,
    errors: resolvedLines.filter((l) => l.line.errors.length > 0).length,
  };
  return { channelId, fileName, totalRows, counts, batches };
}
