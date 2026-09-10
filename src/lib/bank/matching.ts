import type { BankMatchMethod } from "@/lib/types";

/**
 * Deterministic settlement<->bank candidate suggestion (REPORTING_LOGIC.md
 * §11, v1: no fuzzy/ML matching). Priority order, confirmed:
 * (1) exact payout/reference number match, (2) exact amount match,
 * (3) channel + date-proximity + amount-tolerance, (4) description/text
 * similarity. **Auto-resolve to MATCHED only for an unambiguous
 * exact-reference-and-amount case** — every other case, including a
 * lone exact-amount match, is a suggestion for manual confirmation, never
 * silently committed.
 *
 * BCA's own confirmed real export carries no separate reference/sequence
 * column at all (bank-mutation-docx.ts) — tier (1) is implemented for a
 * future bank source that does provide one, but in practice, for BCA,
 * every suggestion this produces requires a manual click; nothing
 * auto-resolves. This is a direct, worth-flagging consequence of the real
 * file format, not a gap in the matching logic.
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

function normalizeForKeywordSearch(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
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

    // Tier 1: exact reference match.
    if (transaction.reference && c.batchReference && transaction.reference === c.batchReference) {
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

    // Tier 2: exact amount match.
    if (amountDiff <= AMOUNT_TOLERANCE) {
      suggestions.push({
        settlementBatchId: c.id,
        channelName: c.channelName,
        batchReference: c.batchReference,
        batchDate: c.batchDate,
        netSettlementAmount: c.netSettlementAmount,
        matchMethod: "EXACT_AMOUNT",
        confidence: 0.9,
        // Never true here even though the amount is exact — the confirmed
        // rule is exact REFERENCE *and* amount, not amount alone (BCA
        // provides no reference at all, so this tier never auto-resolves
        // for BCA transactions).
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

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}
