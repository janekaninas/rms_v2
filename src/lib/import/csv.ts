import Papa from "papaparse";
import { stripBom } from "./parse-utils";

export interface ParsedTable {
  headers: string[];
  /** One object per data row, keyed by trimmed header name. */
  rows: Record<string, string>[];
}

/**
 * Real VHP/export CSVs are not plain tabular files: every sample observed
 * has a multi-line letterhead (villa name, address, report title, a blank
 * line) before the real header row, and uses either `;` or `,` as the
 * field delimiter inconsistently across export runs of the *same* report
 * type (docs/IMPORT_LOGIC.md §1, confirmed against real files in
 * Documents/report/source). Rather than assuming a fixed delimiter or a
 * fixed number of preamble lines, this locates the header row by scanning
 * for the one line that — split by either candidate delimiter — contains
 * `requiredHeaderCell` as an exact cell, then parses everything from that
 * line onward with Papa Parse using the delimiter that matched.
 */
export function parseVhpCsv(fileText: string, requiredHeaderCell: string): ParsedTable {
  const text = stripBom(fileText);
  const lines = text.split(/\r\n|\r|\n/);

  let headerLineIndex = -1;
  let delimiter: "," | ";" | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    for (const candidate of [",", ";"] as const) {
      const cells = line.split(candidate).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cells.some((c) => c.toLowerCase() === requiredHeaderCell.toLowerCase())) {
        headerLineIndex = i;
        delimiter = candidate;
        break;
      }
    }
    if (headerLineIndex !== -1) break;
  }

  if (headerLineIndex === -1 || !delimiter) {
    throw new Error(
      `Could not find a header row containing "${requiredHeaderCell}". This file may not be the expected report type.`,
    );
  }

  const remainder = lines.slice(headerLineIndex).join("\n");
  const result = Papa.parse<Record<string, string>>(remainder, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  const rows = result.data.filter((row) =>
    Object.values(row).some((v) => v !== undefined && v !== null && String(v).trim() !== ""),
  );

  return { headers, rows };
}
