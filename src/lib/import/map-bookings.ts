import { ParsedTable } from "./csv";
import { NormalizedReservationRow } from "./types";
import { cleanText, parseFlexibleDate, parseLocaleNumber } from "./parse-utils";

/**
 * New Bookings (VHP "Reservation By Creation Date" export).
 * Column set and derivation rules per docs/IMPORT_LOGIC.md §1, confirmed
 * against real exports (Documents/report/source/Reservation by Creation
 * Date-*.csv and the newer Downloads samples): No, Created Date,
 * Reservation Number, Reservation Name, Arrival, Departure, Room Number,
 * Room Quantity, Night, Room Type, Nationality, Adult, Compliment,
 * Arrangement, Rate Code, Room Rate, Total Revenue, Guest Name, Segment,
 * Voucher No, SOB, Status, Created By, Created Id, Last Changed Date,
 * Changed By. No "Child" column exists in this report — children stays
 * null rather than a guessed 0.
 */
export function mapBookingsRows(table: ParsedTable): NormalizedReservationRow[] {
  return table.rows.map((raw, i) => {
    const errors: string[] = [];

    const reservationNumber = cleanText(raw["Reservation Number"]);
    if (!reservationNumber) errors.push("Missing Reservation Number");

    const arrivalDate = parseFlexibleDate(raw["Arrival"]);
    if (!arrivalDate) errors.push(`Unparseable Arrival date: "${raw["Arrival"]}"`);

    const departureDate = parseFlexibleDate(raw["Departure"]);
    if (!departureDate) errors.push(`Unparseable Departure date: "${raw["Departure"]}"`);

    // IMPORT_LOGIC.md §1: raw Status can say "Cancelled" even inside the
    // New Bookings export — do not assume this file only has active rows.
    const rawStatus = cleanText(raw["Status"]).toLowerCase();
    const status = rawStatus === "cancelled" ? "CANCELLED" : "ACTIVE";

    // Prefer Total Revenue; fall back to Room Rate — legacy Bookings!AR.
    const totalRevenue = parseLocaleNumber(raw["Total Revenue"]);
    const roomRate = parseLocaleNumber(raw["Room Rate"]);
    const nights =
      arrivalDate && departureDate
        ? Math.round(
            (new Date(departureDate).getTime() - new Date(arrivalDate).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;
    const systemGrossRevenue =
      totalRevenue !== null ? totalRevenue : roomRate !== null && nights ? roomRate * nights : null;

    const channelRawNameCleaned = cleanText(raw["Reservation Name"]);

    return {
      sourceRowNumber: i + 1,
      reservationNumber,
      channelRawName: channelRawNameCleaned === "" ? null : channelRawNameCleaned,
      roomNumber: cleanText(raw["Room Number"]) || null,
      roomType: cleanText(raw["Room Type"]) || null,
      guestName: cleanText(raw["Guest Name"]) || null,
      bookingDate: parseFlexibleDate(raw["Created Date"]),
      arrivalDate,
      departureDate,
      adults: raw["Adult"] ? Number(raw["Adult"]) || null : null,
      children: null,
      status,
      systemGrossRevenue,
      cancelDate: null,
      cancelTime: null,
      cancelReason: null,
      errors,
    };
  });
}
