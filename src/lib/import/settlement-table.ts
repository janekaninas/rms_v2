import type { ParsedTable } from "./csv";

/**
 * Shared by both the CSV and Excel settlement parsers: given the sheet's
 * raw rows (array-of-arrays, no header assumed), locates the real header
 * row and builds a keyed `ParsedTable` from the rows after it.
 *
 * Without `headerRowContains`, row 0 is the header (every confirmed
 * channel except Trip.com). With it, rows are scanned for the first one
 * containing that exact cell value — confirmed necessary for Trip.com's
 * "Prepay statement" export, which has a two-line preamble (a title and a
 * "Total prepaid amount ..." line) before its real header row. Either
 * way, data rows stop at the first fully-blank row, so a second,
 * unrelated table further down the same sheet (Trip.com's "Campaigns"
 * table) is never read as reservation data.
 */
export function rawRowsToTable(rawRows: string[][], headerRowContains?: string): ParsedTable {
  let headerIdx = 0;
  if (headerRowContains) {
    const found = rawRows.findIndex((r) => r.some((cell) => (cell ?? "").trim() === headerRowContains));
    if (found === -1) {
      throw new Error(`Could not find a header row containing "${headerRowContains}" in this file.`);
    }
    headerIdx = found;
  }

  const headers = (rawRows[headerIdx] ?? []).map((h) => (h ?? "").trim());
  const rows: Record<string, string>[] = [];

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] ?? [];
    if (row.every((c) => !c || !String(c).trim())) break;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? "";
    });
    rows.push(obj);
  }

  return { headers, rows };
}
