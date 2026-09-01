import type { ParsedTable } from "./csv";
import { parseFlexibleDate, parseLocaleNumber, cleanText } from "./parse-utils";
import type { SettlementColumnMapping } from "@/lib/types";
import type { NormalizedSettlementLine } from "./settlement-types";

const VALID_LINE_TYPES = new Set([
  "BOOKING_PAYOUT",
  "ADJUSTMENT",
  "REFUND",
  "CORRECTION",
  "FEE",
  "OTHER",
]);

/**
 * Applies a channel's configured column mapping (IMPORT_LOGIC.md §8 pt.1)
 * to a generically-parsed settlement file. The mapping — which source
 * column is "amount," "reservation reference," etc. — is the
 * configuration Jane sets once per channel after seeing a real export;
 * this function never assumes a specific OTA's layout.
 */
export function mapSettlementRows(
  table: ParsedTable,
  mapping: SettlementColumnMapping,
): NormalizedSettlementLine[] {
  return table.rows.map((row, i) => {
    const errors: string[] = [];

    const batchDate = parseFlexibleDate(row[mapping.batchDate]);
    if (!batchDate) errors.push(`Unparseable/missing batch date ("${mapping.batchDate}" column)`);

    const amount = parseLocaleNumber(row[mapping.amount]);
    if (amount === null) errors.push(`Unparseable/missing amount ("${mapping.amount}" column)`);

    const reservationReference = mapping.reservationReference
      ? cleanText(row[mapping.reservationReference]) || null
      : null;

    const rawLineType = mapping.lineType ? cleanText(row[mapping.lineType]).toUpperCase() : "";
    const lineType = VALID_LINE_TYPES.has(rawLineType) ? (rawLineType as NormalizedSettlementLine["lineType"]) : "BOOKING_PAYOUT";

    return {
      sourceRowNumber: i + 1,
      batchReference: mapping.batchReference ? cleanText(row[mapping.batchReference]) || null : null,
      batchDate,
      lineType,
      rawReservationReference: reservationReference,
      amount,
      description: mapping.description ? cleanText(row[mapping.description]) || null : null,
      externalLineRef: mapping.externalLineRef ? cleanText(row[mapping.externalLineRef]) || null : null,
      errors,
    };
  });
}
