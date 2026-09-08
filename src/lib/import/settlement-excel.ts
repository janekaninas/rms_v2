import * as XLSX from "xlsx";
import type { ParsedTable } from "./csv";
import { rawRowsToTable } from "./settlement-table";

/**
 * Confirmed necessary against real Tiket.com (.xlsx) and Trip.com (.xls,
 * the legacy binary format) settlement exports — CSV-only parsing can't
 * read either. Reads the first sheet only; none of the confirmed real
 * exports use more than one relevant sheet (Trip.com's second table,
 * "Campaigns", is a second table on the *same* sheet, handled by
 * `rawRowsToTable`'s stop-at-blank-row rule, not a second sheet).
 */
export function parseSettlementExcel(buffer: ArrayBuffer, headerRowContains?: string): ParsedTable {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("This Excel file has no sheets.");
  const sheet = workbook.Sheets[sheetName];

  const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  return rawRowsToTable(rawRows, headerRowContains);
}

export function isExcelFile(fileName: string): boolean {
  return /\.(xlsx|xls)$/i.test(fileName);
}

/** Dispatches to the CSV or Excel parser by file extension — the one
 * place that needs to know both formats exist. */
export async function parseSettlementUpload(file: File, headerRowContains?: string): Promise<ParsedTable> {
  if (isExcelFile(file.name)) {
    const buffer = await file.arrayBuffer();
    return parseSettlementExcel(buffer, headerRowContains);
  }
  const { parseSettlementFile } = await import("./settlement-csv");
  const text = await file.text();
  return parseSettlementFile(text, headerRowContains);
}
