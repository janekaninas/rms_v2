import JSZip from "jszip";
import { parseFlexibleDate } from "./parse-utils";

/**
 * Parses BCA's "Informasi Rekening - Mutasi Rekening" statement export —
 * confirmed against three real samples this revision (IMPORT_LOGIC.md §9).
 * Jane's exports are a Word-document paste of the KlikBCA Bisnis portal
 * page, not a native CSV/XLSX (the page itself offers "Format Download csv
 * html" — a direct CSV/HTML export would be preferable per §9's format
 * preference order, and is worth asking Jane for going forward), so this is
 * the confirmed real BCA export format for now. Parsing walks the .docx's
 * own paragraph/table text (deterministic XML extraction, never OCR — the
 * explicit acceptable tier-2 fallback when a structured export isn't in
 * hand) rather than guessing a layout from memory.
 *
 * Real shape observed across all three samples:
 * - One or more account sections per file, each headed by either the
 *   Indonesian template ("No. rekening / Nama / Periode / Kode Mata Uang")
 *   or the English one ("Account Number / Name / Period / Currency") —
 *   the same BCA account can render in either language depending on
 *   portal/session settings, confirmed by one real sample containing both
 *   templates for two different accounts in the same document.
 * - Each transaction row is `<date-or-PEND> <free-text description>
 *   <amount> <CR|DB> <running balance>` — direction is embedded in the
 *   amount cell's own text, not a separate debit/credit column.
 * - A trailing "PEND" row (no date) is a same-period transaction BCA
 *   hasn't posted with a date yet — confirmed by cross-referencing two
 *   consecutive real statements: a PEND row in one period's export
 *   reappears, byte-identical in its embedded MID/ADM/amount, as a
 *   normally-dated row at the start of the next period's export. Also
 *   confirmed the footer's own declared credit/debit totals *include* the
 *   PEND row's amount. Skipping PEND rows on import (they arrive correctly
 *   dated next period) avoids ever having to invent a date for one.
 * - Each section's own footer (Saldo Awal/Akhir + Mutasi Debet/Kredit, or
 *   Starting/Ending Balance + Total Credits/Debits) is extracted so the
 *   import preview can cross-check the declared total against the parsed
 *   rows' own sum — the same "declared vs. summed, surfaced not silently
 *   overridden" pattern already used for Airbnb's settlement batches.
 */

export interface BankMutationRow {
  /** Null only for a PEND row — never a guessed date. */
  transactionDate: string | null;
  isPending: boolean;
  description: string;
  /** Unsigned magnitude; direction carries the sign. */
  amount: number;
  direction: "CR" | "DB";
  runningBalance: number;
}

export interface BankMutationAccountSection {
  accountNumber: string;
  accountName: string;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
  rows: BankMutationRow[];
  pendingCount: number;
  /** Declared footer figures, for the declared-vs-summed cross-check — null if that language variant didn't expose one. */
  declaredCreditTotal: number | null;
  declaredCreditCount: number | null;
  declaredDebitTotal: number | null;
  declaredDebitCount: number | null;
}

const DATE_OR_PEND = String.raw`(?:\d{2}/\d{2}/\d{4}|PEND)`;
const AMOUNT = String.raw`[\d,]+\.\d{2}`;

// Non-greedy description, bounded by the next row's date-or-PEND token or
// this section's own footer keyword — never by a fixed column width, since
// the source is flowing paragraph text, not a delimited file.
const ROW_RE = new RegExp(
  `(${DATE_OR_PEND})\\s+(.*?)\\s+(${AMOUNT})\\s+(CR|DB)\\s+(${AMOUNT})` +
    `(?=\\s+(?:${DATE_OR_PEND})\\b|\\s+Saldo Awal\\s*:|\\s+Starting Balance\\s*:)`,
  "g",
);

const HEADER_RE = new RegExp(
  String.raw`(?:No\.\s*rekening|Account\s*Number)\s*:\s*([\w-]+)\s+` +
    String.raw`(?:Nama|Name)\s*:\s*(.+?)\s+` +
    String.raw`(?:Periode|Period)\s*:\s*(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})\s+` +
    String.raw`(?:Kode\s*Mata\s*Uang|Currency)\s*:\s*(\S+)`,
  "g",
);

const FOOTER_ID_RE =
  /Mutasi\s+Debet\s*:\s*([\d,]+\.\d{2})\s*(\d+)?\s+Mutasi\s+Kredit\s*:\s*([\d,]+\.\d{2})\s*(\d+)?/;
const FOOTER_EN_RE =
  /Total\s+Credits\s*:\s*([\d,]+\.\d{2})\s+Total\s+Debits\s*:\s*([\d,]+\.\d{2})/;

function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function stripDocxXmlToText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = zip.file("word/document.xml");
  if (!docXml) throw new Error("This .docx file has no word/document.xml — is it really a Word document?");
  const xml = await docXml.async("string");
  return stripDocxXmlToText(xml);
}

/** Parses already-extracted flat text — split out so it's independently testable against captured samples without re-unzipping. */
export function parseBcaMutationText(text: string): BankMutationAccountSection[] {
  const headerMatches = [...text.matchAll(HEADER_RE)];
  if (headerMatches.length === 0) {
    throw new Error(
      "Could not find a BCA account header (\"No. rekening\"/\"Account Number\") in this file — is this a BCA mutation export?",
    );
  }

  const sections: BankMutationAccountSection[] = [];
  for (let i = 0; i < headerMatches.length; i++) {
    const m = headerMatches[i];
    const chunkStart = m.index! + m[0].length;
    const chunkEnd = i + 1 < headerMatches.length ? headerMatches[i + 1].index! : text.length;
    const chunk = text.slice(chunkStart, chunkEnd);

    const rows: BankMutationRow[] = [];
    let pendingCount = 0;
    for (const rm of chunk.matchAll(ROW_RE)) {
      const [, dateToken, description, amountRaw, direction, balanceRaw] = rm;
      const isPending = dateToken === "PEND";
      if (isPending) pendingCount++;
      rows.push({
        transactionDate: isPending ? null : parseFlexibleDate(dateToken),
        isPending,
        description: description.trim(),
        amount: parseAmount(amountRaw),
        direction: direction as "CR" | "DB",
        runningBalance: parseAmount(balanceRaw),
      });
    }

    const idFooter = chunk.match(FOOTER_ID_RE);
    const enFooter = chunk.match(FOOTER_EN_RE);

    sections.push({
      accountNumber: m[1],
      accountName: m[2].trim(),
      periodStart: parseFlexibleDate(m[3]),
      periodEnd: parseFlexibleDate(m[4]),
      currency: m[5] === "Rp" ? "IDR" : m[5],
      rows,
      pendingCount,
      declaredDebitTotal: idFooter ? parseAmount(idFooter[1]) : null,
      declaredDebitCount: idFooter?.[2] ? Number(idFooter[2]) : null,
      declaredCreditTotal: idFooter ? parseAmount(idFooter[3]) : enFooter ? parseAmount(enFooter[1]) : null,
      declaredCreditCount: idFooter?.[4] ? Number(idFooter[4]) : null,
    });
  }

  return sections;
}

export async function parseBcaMutationDocx(buffer: ArrayBuffer): Promise<BankMutationAccountSection[]> {
  const text = await extractDocxText(buffer);
  return parseBcaMutationText(text);
}
