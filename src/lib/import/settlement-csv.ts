import Papa from "papaparse";
import { stripBom } from "./parse-utils";
import type { ParsedTable } from "./csv";
import { rawRowsToTable } from "./settlement-table";

/**
 * A settlement export's real layout varies by channel (confirmed against
 * real Booking.com/Airbnb/Trip.com exports — FINANCIAL_LOGIC.md §10 item
 * 19). This makes no channel-specific assumption itself: it parses the
 * whole file into raw rows (letting Papa Parse auto-detect the
 * delimiter) and hands off to `rawRowsToTable`, which locates the real
 * header row — row 0 by default, or via `headerRowContains` for a file
 * with a preamble.
 */
export function parseSettlementFile(fileText: string, headerRowContains?: string): ParsedTable {
  const text = stripBom(fileText);

  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
  });

  const rawRows = (result.data ?? []).map((r) => r.map((c) => (c ?? "").trim()));
  return rawRowsToTable(rawRows, headerRowContains);
}
