import Papa from "papaparse";
import { stripBom } from "./parse-utils";
import type { ParsedTable } from "./csv";

/**
 * A settlement export's real layout is unknown (FINANCIAL_LOGIC.md §10
 * item 19, still open — no real Airbnb/Booking.com/Expedia sample has
 * been supplied). Unlike `parseVhpCsv`, this makes no assumption about a
 * required header cell or a letterhead preamble: it treats the first
 * non-blank line as the header row and lets Papa Parse auto-detect the
 * delimiter. If a real export turns out to need VHP-style preamble
 * skipping, this is the one place to add it — never per-channel.
 */
export function parseSettlementFile(fileText: string): ParsedTable {
  const text = stripBom(fileText);

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  const rows = result.data.filter((row) =>
    Object.values(row).some((v) => v !== undefined && v !== null && String(v).trim() !== ""),
  );

  return { headers, rows };
}
