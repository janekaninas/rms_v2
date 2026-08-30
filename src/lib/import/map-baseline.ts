import { ParsedTable } from "./csv";
import { NormalizedReservationRow } from "./types";
import { cleanText, parseFlexibleDate, parseLocaleNumber } from "./parse-utils";

/**
 * Baseline / Arrival Report Snapshot (VHP "Arrival Guest Report" export).
 * docs/IMPORT_LOGIC.md §11 names this report as the source but — unlike
 * §1/§2 — does not enumerate its columns. Confirmed against real exports
 * (Documents/report/source/Arrival Guest Report-*.csv): No, Room Number,
 * Reservation Number, Group Name, Repeater Guest, Guest Name, VIP,
 * Arrangement, Room Type, Room Rate, Adult / Child, Compliment,
 * Nationality, Date Of Birth, Company / Agent Name, Arrival, Departure,
 * Reservation Status, Flight, Time, Stay, No of Visit, Email, Mobile
 * Phone, Remark, actions.
 *
 * "Company / Agent Name" is treated as this report's channel-equivalent
 * field — the same functional role as "Reservation Name" in the Bookings
 * export (both carry values like "AGODA, T&T" / "Bali Euphoria, T&T") —
 * and the Room Rate × nights revenue fallback is extended from the
 * already-confirmed Bookings rule (§1) since it is the same VHP field on
 * the same underlying reservation record, not a new formula. Flag if
 * either assumption doesn't match your intent.
 */
export function mapBaselineRows(table: ParsedTable): NormalizedReservationRow[] {
  return table.rows.map((raw, i) => {
    const errors: string[] = [];

    const reservationNumber = cleanText(raw["Reservation Number"]);
    if (!reservationNumber) errors.push("Missing Reservation Number");

    const arrivalDate = parseFlexibleDate(raw["Arrival"]);
    if (!arrivalDate) errors.push(`Unparseable Arrival date: "${raw["Arrival"]}"`);

    const departureDate = parseFlexibleDate(raw["Departure"]);
    if (!departureDate) errors.push(`Unparseable Departure date: "${raw["Departure"]}"`);

    const nights =
      arrivalDate && departureDate
        ? Math.round(
            (new Date(departureDate).getTime() - new Date(arrivalDate).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

    const roomRate = parseLocaleNumber(raw["Room Rate"]);
    const systemGrossRevenue = roomRate !== null && nights ? roomRate * nights : null;

    const [adultsRaw, childrenRaw] = cleanText(raw["Adult / Child"]).split("/");
    const adults = adultsRaw && !Number.isNaN(Number(adultsRaw)) ? Number(adultsRaw) : null;
    const children = childrenRaw && !Number.isNaN(Number(childrenRaw)) ? Number(childrenRaw) : null;

    const rawStatus = cleanText(raw["Reservation Status"]).toLowerCase();
    const status = rawStatus.includes("cancel") ? "CANCELLED" : "ACTIVE";

    const channelRawNameCleaned = cleanText(raw["Company / Agent Name"]);

    return {
      sourceRowNumber: i + 1,
      reservationNumber,
      channelRawName: channelRawNameCleaned === "" ? null : channelRawNameCleaned,
      roomNumber: cleanText(raw["Room Number"]) || null,
      roomType: cleanText(raw["Room Type"]) || null,
      guestName: cleanText(raw["Guest Name"]) || null,
      bookingDate: null,
      arrivalDate,
      departureDate,
      adults,
      children,
      status,
      systemGrossRevenue,
      cancelDate: null,
      cancelTime: null,
      cancelReason: null,
      errors,
    };
  });
}
