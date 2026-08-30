import { ParsedTable } from "./csv";
import { NormalizedReservationRow } from "./types";
import { cleanText, parseFlexibleDate, parseLocaleNumber } from "./parse-utils";

/**
 * Cancelled Reservations (VHP "cancelled-reservation" export).
 * Column set per docs/IMPORT_LOGIC.md §2, confirmed against real exports:
 * Reservation Number, Column Number, Room Number, Guest Name, Reservation
 * Name, Arrival, Night, Departure, Room Quantity, Room Type, Adult, Child,
 * Compliment, Arrangement Code, Room Rate, Cancel Date, Cancel Time,
 * Cancelled Id, Created Date, Reservation Status, Cancel Reason, Voucher.
 * Every row in this file is, by definition, a cancellation.
 */
export function mapCancellationsRows(table: ParsedTable): NormalizedReservationRow[] {
  return table.rows.map((raw, i) => {
    const errors: string[] = [];

    const reservationNumber = cleanText(raw["Reservation Number"]);
    if (!reservationNumber) errors.push("Missing Reservation Number");

    const arrivalDate = parseFlexibleDate(raw["Arrival"]);
    const departureDate = parseFlexibleDate(raw["Departure"]);
    const cancelDate = parseFlexibleDate(raw["Cancel Date"]);
    if (!cancelDate) errors.push(`Unparseable Cancel Date: "${raw["Cancel Date"]}"`);

    const roomRate = parseLocaleNumber(raw["Room Rate"]);
    const nights =
      arrivalDate && departureDate
        ? Math.round(
            (new Date(departureDate).getTime() - new Date(arrivalDate).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

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
      children: raw["Child"] ? Number(raw["Child"]) || null : null,
      status: "CANCELLED",
      systemGrossRevenue: roomRate !== null && nights ? roomRate * nights : null,
      cancelDate,
      cancelTime: cleanText(raw["Cancel Time"]) || null,
      cancelReason: cleanText(raw["Cancel Reason"]) || null,
      errors,
    };
  });
}
