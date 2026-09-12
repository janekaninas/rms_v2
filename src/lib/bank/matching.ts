import type { BankMatchMethod } from "@/lib/types";

/**
 * Deterministic settlement<->bank candidate suggestion (REPORTING_LOGIC.md
 * §11, v1: no fuzzy/ML matching). Priority order, confirmed:
 * (1) exact payout/reference number match, (2) exact amount match,
 * (3) channel + date-proximity + amount-tolerance, (4) description/text
 * similarity.
 *
 * BCA's own confirmed real export carries no separate reference/sequence
 * *column* at all (bank-mutation-docx.ts) — but real BCA descriptions were
 * confirmed to embed the OTA's own payout/batch reference directly in the
 * free-text description (e.g. "...BOOKING COM BV NOVW31LMYZNEOWAYOG..."
 * literally contains Booking.com's real payout ID "Vw31lmyzNEOwayoG").
 * Tier (1) therefore also checks whether a batch's own reference appears
 * as a substring of the transaction description — this is still a
 * genuine reference match, just extracted from free text rather than a
 * dedicated column.
 *
 * **`[Confirmed rule — Jane, this revision]` Auto-resolve also covers an
 * unambiguous exact-amount match**, not only exact-reference-and-amount —
 * confirmed necessary because some channels (e.g. Trip.com) have no batch
 * reference at all to embed or compare (their settlement mapping has no
 * batchReference column), so the reference tier can structurally never
 * fire for them; requiring a reference would mean those channels never
 * auto-resolve no matter how obviously correct the match is. "Unambiguous"
 * here means exactly one eligible settlement batch anywhere in the system
 * shares that exact amount — if two or more batches tie on the same
 * amount, none of them auto-resolve, since picking one over the other
 * would be a real guess, not a determination.
 */

export interface CandidateBatch {
  id: string;
  channelId: string;
  channelName: string;
  batchReference: string | null;
  batchDate: string;
  netSettlementAmount: number;
  /** Sum of already-confirmed settlement_bank_allocations for this batch. */
  alreadyAllocated: number;
}

export interface BankMatchSuggestion {
  settlementBatchId: string;
  channelName: string;
  batchReference: string | null;
  batchDate: string;
  netSettlementAmount: number;
  matchMethod: BankMatchMethod;
  /** Advisory only (REPORTING_LOGIC.md/DATA_MODEL.md §6) — never used to auto-decide anything beyond the explicit exact-ref-and-amount tier. */
  confidence: number;
  autoResolvable: boolean;
}

const AMOUNT_TOLERANCE = 1;
const DATE_PROXIMITY_DAYS = 5;
// A generous ceiling on "close enough amount" for the weakest tier — a
// real payout can differ from the bank receipt by a bank fee or a partial
// remittance, but a wildly different amount is not a plausible match.
const LOOSE_AMOUNT_TOLERANCE_PCT = 0.15;
// A reference shorter than this could plausibly appear in unrelated free
// text by coincidence (e.g. a short numeric code) — only a reference at
// least this specific counts as an embedded-reference match.
const MIN_EMBEDDABLE_REFERENCE_LENGTH = 8;

function normalizeForKeywordSearch(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A batch reference specific enough to trust, found verbatim inside the transaction's free-text description — real BCA descriptions were confirmed to embed exactly this (Booking.com's payout ID appears as "...BOOKING COM BV NO<reference>..."). */
function descriptionEmbedsReference(description: string, batchReference: string | null): boolean {
  if (!batchReference || batchReference.length < MIN_EMBEDDABLE_REFERENCE_LENGTH) return false;
  return normalizeForKeywordSearch(description).includes(normalizeForKeywordSearch(batchReference));
}

/** Does the transaction description plausibly reference this channel? Real BCA samples confirm this: "BOOKING COM", "TRIP COM", "tiketcom...", "...Airbnb Payments UK Limited" all appear verbatim in real transaction descriptions. */
function descriptionMentionsChannel(description: string, channelName: string): boolean {
  const normalizedDescription = normalizeForKeywordSearch(description);
  const normalizedChannel = normalizeForKeywordSearch(channelName);
  if (normalizedChannel.length < 3) return false;
  return normalizedDescription.includes(normalizedChannel);
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

export function suggestCandidatesForTransaction(
  transaction: { date: string; amount: number; description: string; reference: string | null },
  candidates: CandidateBatch[],
): BankMatchSuggestion[] {
  // Only unallocated (or partially-allocated) batches are worth suggesting.
  const eligible = candidates.filter((c) => c.alreadyAllocated < c.netSettlementAmount - AMOUNT_TOLERANCE);
  const suggestions: BankMatchSuggestion[] = [];

  for (const c of eligible) {
    const remaining = c.netSettlementAmount - c.alreadyAllocated;
    const amountDiff = Math.abs(remaining - transaction.amount);

    // Tier 1: exact reference match — either a dedicated reference column
    // matching exactly, or the batch's own reference found embedded in
    // the description's free text (confirmed real BCA behavior).
    const exactRefColumnMatch = Boolean(transaction.reference && c.batchReference && transaction.reference === c.batchReference);
    const embeddedRefMatch = descriptionEmbedsReference(transaction.description, c.batchReference);
    if (exactRefColumnMatch || embeddedRefMatch) {
      const exactAmount = amountDiff <= AMOUNT_TOLERANCE;
      suggestions.push({
        settlementBatchId: c.id,
        channelName: c.channelName,
        batchReference: c.batchReference,
        batchDate: c.batchDate,
        netSettlementAmount: c.netSettlementAmount,
        matchMethod: "REFERENCE_MATCH",
        confidence: exactAmount ? 1 : 0.7,
        autoResolvable: exactAmount,
      });
      continue;
    }

    // Tier 2: exact amount match. autoResolvable is filled in below, once
    // every candidate has been considered and we know whether this amount
    // is actually unique across all eligible batches.
    if (amountDiff <= AMOUNT_TOLERANCE) {
      suggestions.push({
        settlementBatchId: c.id,
        channelName: c.channelName,
        batchReference: c.batchReference,
        batchDate: c.batchDate,
        netSettlementAmount: c.netSettlementAmount,
        matchMethod: "EXACT_AMOUNT",
        confidence: 0.9,
        autoResolvable: false,
      });
      continue;
    }

    // Tier 3/4: channel keyword + date proximity + loose amount tolerance,
    // falling back to channel keyword alone at lower confidence when
    // amount/date don't line up (DATA_MODEL.md's enum has no separate
    // "description similarity" value — folded into the weakest end of
    // AMOUNT_AND_DATE_PROXIMITY, per the confirmed priority order).
    const channelMatch = descriptionMentionsChannel(transaction.description, c.channelName);
    if (!channelMatch) continue;

    const dateDiff = daysBetween(transaction.date, c.batchDate);
    const looseAmountOk = amountDiff <= Math.max(AMOUNT_TOLERANCE, remaining * LOOSE_AMOUNT_TOLERANCE_PCT);

    let confidence = 0.3; // channel keyword alone
    if (dateDiff <= DATE_PROXIMITY_DAYS) confidence += 0.2;
    if (looseAmountOk) confidence += 0.2;

    suggestions.push({
      settlementBatchId: c.id,
      channelName: c.channelName,
      batchReference: c.batchReference,
      batchDate: c.batchDate,
      netSettlementAmount: c.netSettlementAmount,
      matchMethod: "AMOUNT_AND_DATE_PROXIMITY",
      confidence: Math.min(confidence, 0.8),
      autoResolvable: false,
    });
  }

  // An exact-amount match auto-resolves only when it's the sole one found
  // — if a reference match (embedded or column) already fired above, that
  // one wins and no exact-amount suggestion needs to carry autoResolvable
  // at all. Two or more exact-amount ties are a genuine ambiguity, left
  // for manual confirmation like any other non-unanimous case.
  const hasAutoResolvableReferenceMatch = suggestions.some((s) => s.matchMethod === "REFERENCE_MATCH" && s.autoResolvable);
  const exactAmountMatches = suggestions.filter((s) => s.matchMethod === "EXACT_AMOUNT");
  if (!hasAutoResolvableReferenceMatch && exactAmountMatches.length === 1) {
    exactAmountMatches[0].autoResolvable = true;
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}
