import type { SettlementLineType } from "@/lib/types";

export interface NormalizedSettlementLine {
  sourceRowNumber: number;
  batchReference: string | null;
  batchDate: string | null;
  lineType: SettlementLineType;
  rawReservationReference: string | null;
  amount: number | null;
  description: string | null;
  externalLineRef: string | null;
  errors: string[];
}

export type SettlementMatchOutcome = "MATCHED" | "AMBIGUOUS" | "UNMATCHED" | "NOT_APPLICABLE";

export interface ResolvedSettlementLine {
  line: NormalizedSettlementLine;
  matchOutcome: SettlementMatchOutcome;
  matchedReservationId: string | null;
  matchedReservationNumber: string | null;
  matchCandidateCount: number;
}

export interface SettlementBatchPreview {
  batchReference: string | null;
  batchDate: string;
  lines: ResolvedSettlementLine[];
  grossAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  isDuplicateOfExistingBatch: boolean;
}

export interface SettlementImportPreview {
  channelId: string;
  fileName: string;
  totalRows: number;
  counts: {
    matched: number;
    unmatched: number;
    ambiguous: number;
    errors: number;
  };
  batches: SettlementBatchPreview[];
}

/** Shared by both the parsed-file commit path and manual entry — the data
 * model and reconciliation behavior are identical either way
 * (IMPORT_LOGIC.md §8 pt.7); only how a draft is constructed differs. */
export interface SettlementLineDraft {
  lineType: SettlementLineType;
  rawReservationReference: string | null;
  amount: number;
  description: string | null;
  externalLineRef: string | null;
}

export interface SettlementBatchDraft {
  channelId: string;
  batchReference: string | null;
  batchDate: string;
  lines: SettlementLineDraft[];
}
