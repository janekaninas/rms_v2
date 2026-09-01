import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedSettlementLine, ResolvedSettlementLine, SettlementBatchPreview, SettlementImportPreview } from "./settlement-types";
import { batchDedupeHash } from "./settlement-hash";
import { buildReservationLookup, matchSettlementReservation, type ReservationCandidate } from "./settlement-match";

export async function resolveSettlementImport(
  supabase: SupabaseClient,
  channelId: string,
  fileName: string,
  lines: NormalizedSettlementLine[],
): Promise<SettlementImportPreview> {
  const { data: reservationRows } = await supabase
    .from("reservations")
    .select("id, reservation_number")
    .eq("channel_id", channelId);
  const reservations = (reservationRows ?? []) as ReservationCandidate[];
  const { exactByNumber, normalizedByNumber } = buildReservationLookup(reservations);

  const resolvedLines: ResolvedSettlementLine[] = lines.map((line) => {
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
  });

  // Group into batches by batchReference when the mapping supplies one;
  // otherwise the whole file is one batch (IMPORT_LOGIC.md §8: "one
  // payout, or per file, if the file is naturally one payout").
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

    let isDuplicateOfExistingBatch = false;
    if (batchReference) {
      const { count } = await supabase
        .from("ota_settlement_batches")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channelId)
        .eq("batch_reference", batchReference);
      isDuplicateOfExistingBatch = (count ?? 0) > 0;
    } else {
      const hash = batchDedupeHash(channelId, batchDate, netAmount, "IDR");
      const { count } = await supabase
        .from("ota_settlement_batches")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channelId)
        .eq("dedupe_hash", hash);
      isDuplicateOfExistingBatch = (count ?? 0) > 0;
    }

    batches.push({
      batchReference,
      batchDate,
      lines: groupLines,
      grossAmount,
      adjustmentAmount,
      netAmount,
      isDuplicateOfExistingBatch,
    });
  }

  const counts = {
    matched: resolvedLines.filter((l) => l.matchOutcome === "MATCHED").length,
    unmatched: resolvedLines.filter((l) => l.matchOutcome === "UNMATCHED").length,
    ambiguous: resolvedLines.filter((l) => l.matchOutcome === "AMBIGUOUS").length,
    errors: lines.filter((l) => l.errors.length > 0).length,
  };

  return { channelId, fileName, totalRows: lines.length, counts, batches };
}
