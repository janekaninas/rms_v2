import type { ParsedTable } from "./csv";
import { parseLocaleNumber, cleanText } from "./parse-utils";
import { parseSettlementDate } from "./settlement-date";
import type { SettlementColumnMapping, SettlementExtraFieldMapping } from "@/lib/types";
import type { NormalizedSettlementLine } from "./settlement-types";

const VALID_LINE_TYPES = new Set([
  "BOOKING_PAYOUT",
  "ADJUSTMENT",
  "REFUND",
  "CORRECTION",
  "FEE",
  "OTHER",
]);

function buildExtraFields(
  row: Record<string, string>,
  fields: SettlementExtraFieldMapping[] | undefined,
): Record<string, string> | null {
  if (!fields || fields.length === 0) return null;
  const result: Record<string, string> = {};
  for (const f of fields) {
    const v = row[f.column];
    if (v !== undefined && v !== null && String(v).trim() !== "") result[f.label] = String(v).trim();
  }
  return Object.keys(result).length > 0 ? result : null;
}

function joinDescription(row: Record<string, string>, col1?: string, col2?: string): string | null {
  const parts = [col1, col2].filter((c): c is string => Boolean(c)).map((c) => cleanText(row[c])).filter((v) => v);
  return parts.length > 0 ? parts.join(" — ") : null;
}

/**
 * Flat mode (confirmed against the real Booking.com export): every row is
 * one settlement line; rows sharing a batch reference/date group into one
 * batch at the resolve step, not here.
 */
export function mapSettlementRows(
  table: ParsedTable,
  mapping: SettlementColumnMapping,
): NormalizedSettlementLine[] {
  return table.rows.map((row, i) => {
    const errors: string[] = [];

    const batchDate = mapping.batchDate ? parseSettlementDate(row[mapping.batchDate], mapping.dateFormat) : null;
    if (!batchDate) errors.push(`Unparseable/missing batch date ("${mapping.batchDate}" column)`);

    const amount = mapping.amount ? parseLocaleNumber(row[mapping.amount]) : null;
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
      description: joinDescription(row, mapping.description, mapping.description2),
      externalLineRef: mapping.externalLineRef ? cleanText(row[mapping.externalLineRef]) || null : null,
      extraFields: buildExtraFields(row, mapping.extraFields),
      errors,
    };
  });
}

export interface HierarchicalBatchGroup {
  batchReference: string | null;
  batchDate: string | null;
  /** The Payout row's own declared total (e.g. Airbnb's "Paid out"). */
  declaredTotal: number | null;
  description: string | null;
  lines: NormalizedSettlementLine[];
  /** Errors tied to the group itself (e.g. an unparseable Payout date), not to any one line. */
  groupErrors: string[];
}

/**
 * Hierarchical mode (confirmed against the real Airbnb export): `Type =
 * Payout` rows start a new batch; `Type = Reservation` rows become that
 * batch's lines, attributed to the nearest preceding Payout row by file
 * order — this is a sequential/stateful grouping rule, not a shared
 * column value, which is why it needs its own parser rather than reusing
 * the flat-mode "group by batch reference" step.
 */
export function mapHierarchicalSettlementRows(
  table: ParsedTable,
  mapping: SettlementColumnMapping,
): HierarchicalBatchGroup[] {
  const h = mapping.hierarchical;
  if (!h) return [];

  const groups: HierarchicalBatchGroup[] = [];
  let current: HierarchicalBatchGroup | null = null;
  const payoutValue = h.payoutTypeValue.trim().toLowerCase();
  const reservationValue = h.reservationTypeValue.trim().toLowerCase();

  table.rows.forEach((row, i) => {
    const rowNum = i + 1;
    const typeVal = cleanText(row[h.typeColumn]).toLowerCase();

    if (typeVal === payoutValue) {
      const batchDate = parseSettlementDate(row[h.payout.batchDateColumn], mapping.dateFormat);
      const batchReference = cleanText(row[h.payout.batchReferenceColumn]) || null;
      const declaredTotal = parseLocaleNumber(row[h.payout.batchTotalColumn]);
      const description = h.payout.descriptionColumn ? cleanText(row[h.payout.descriptionColumn]) || null : null;

      const groupErrors: string[] = [];
      if (!batchDate) groupErrors.push(`Row ${rowNum}: unparseable/missing Payout date`);
      if (declaredTotal === null) groupErrors.push(`Row ${rowNum}: unparseable/missing Payout total`);

      current = { batchReference, batchDate, declaredTotal, description, lines: [], groupErrors };
      groups.push(current);
      return;
    }

    if (typeVal === reservationValue) {
      if (!current) {
        current = {
          batchReference: null,
          batchDate: null,
          declaredTotal: null,
          description: null,
          lines: [],
          groupErrors: [`Row ${rowNum}: a Reservation row appeared before any Payout row — cannot attribute it to a batch`],
        };
        groups.push(current);
      }

      const amount = parseLocaleNumber(row[h.reservation.amountColumn]);
      const reservationReference = cleanText(row[h.reservation.reservationReferenceColumn]) || null;
      const errors: string[] = [];
      if (amount === null) errors.push(`Row ${rowNum}: unparseable/missing amount`);
      if (!reservationReference) errors.push(`Row ${rowNum}: missing reservation reference`);

      current.lines.push({
        sourceRowNumber: rowNum,
        batchReference: current.batchReference,
        batchDate: current.batchDate,
        lineType: "BOOKING_PAYOUT",
        rawReservationReference: reservationReference,
        amount,
        description: joinDescription(row, h.reservation.descriptionColumn, h.reservation.description2Column),
        externalLineRef: h.reservation.externalLineRefColumn ? cleanText(row[h.reservation.externalLineRefColumn]) || null : null,
        extraFields: buildExtraFields(row, h.reservation.extraFields),
        errors,
      });
      return;
    }

    // A row whose Type value matches neither configured value — surfaced
    // as its own zero-line error group rather than silently skipped.
    groups.push({
      batchReference: null,
      batchDate: null,
      declaredTotal: null,
      description: null,
      lines: [],
      groupErrors: [`Row ${rowNum}: unrecognized "${h.typeColumn}" value "${row[h.typeColumn] ?? ""}" — expected "${h.payoutTypeValue}" or "${h.reservationTypeValue}"`],
    });
  });

  return groups;
}
