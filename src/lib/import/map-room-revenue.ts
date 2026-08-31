import { ParsedTable } from "./csv";
import { cleanText, parseFlexibleDate, parseLocaleNumber } from "./parse-utils";

export interface NormalizedRoomRevenueRow {
  sourceRowNumber: number;
  reservationNumber: string;
  stayDate: string | null;
  roomNumber: string | null;
  roomType: string | null;
  guestName: string | null;
  commercialRevenueBasisAmount: number | null;
  errors: string[];
}

/**
 * Room Revenue Breakdown (VHP "ROOM REV" export) — the authoritative
 * daily grain (docs/IMPORT_LOGIC.md §3). Confirmed against the real
 * "ROOM REV" sheet in the legacy workbook (Documents/report/): CURRENT
 * DATE, Room Number, Reservation Number, Room Type, ..., Room Rate,
 * ..., Room Revenue, ..., Guest Name, .... "Room Revenue" is the
 * per-night commercial revenue basis amount; "Room Rate" is used as a
 * fallback only when Room Revenue is blank, mirroring the same
 * preference already confirmed for the Bookings import (§1).
 */
export function mapRoomRevenueRows(table: ParsedTable): NormalizedRoomRevenueRow[] {
  return table.rows.map((raw, i) => {
    const errors: string[] = [];

    const reservationNumber = cleanText(raw["Reservation Number"]);
    if (!reservationNumber) errors.push("Missing Reservation Number");

    const stayDate = parseFlexibleDate(raw["CURRENT DATE"] ?? raw["Date"]);
    if (!stayDate) errors.push(`Unparseable CURRENT DATE: "${raw["CURRENT DATE"]}"`);

    const roomRevenue = parseLocaleNumber(raw["Room Revenue"]);
    const roomRate = parseLocaleNumber(raw["Room Rate"]);
    const commercialRevenueBasisAmount = roomRevenue !== null ? roomRevenue : roomRate;
    if (commercialRevenueBasisAmount === null) errors.push("Missing Room Revenue and Room Rate");

    return {
      sourceRowNumber: i + 1,
      reservationNumber,
      stayDate,
      roomNumber: cleanText(raw["Room Number"]) || null,
      roomType: cleanText(raw["Room Type"]) || null,
      guestName: cleanText(raw["Guest Name"]) || null,
      commercialRevenueBasisAmount,
      errors,
    };
  });
}
