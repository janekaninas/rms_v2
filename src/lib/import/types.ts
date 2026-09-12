export type ImportKind = "BASELINE_RESERVATION_SNAPSHOT" | "NEW_BOOKINGS" | "CANCELLATIONS";

export interface NormalizedReservationRow {
  sourceRowNumber: number;
  reservationNumber: string;
  /** The OTA's own booking reference (VHP's "Voucher No"/"Voucher" column) — what an OTA settlement file's reservation reference actually matches, confirmed against real Booking.com data (never VHP's own reservationNumber). Null for a report shape with no such column (e.g. the Baseline/Arrival Report Snapshot). */
  voucherNumber: string | null;
  channelRawName: string | null;
  roomNumber: string | null;
  roomType: string | null;
  guestName: string | null;
  bookingDate: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  adults: number | null;
  children: number | null;
  status: "ACTIVE" | "CANCELLED";
  systemGrossRevenue: number | null;
  cancelDate: string | null;
  cancelTime: string | null;
  cancelReason: string | null;
  /** Populated when a required field is missing/unparseable — the row is excluded from commit. */
  errors: string[];
}

export type RowAction = "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";

export interface ResolvedRow {
  row: NormalizedReservationRow;
  action: RowAction;
  channelId: string | null;
  channelUnknown: boolean;
  villaId: string | null;
  villaUnknown: boolean;
  /** Set when this update would change arrival/departure/room/rate vs. the stored reservation. */
  changeFlags: string[];
  existingReservationId: string | null;
  /** The stored booking_date, if any — preserved when this row doesn't supply one (e.g. Baseline import). */
  existingBookingDate: string | null;
  /** The stored voucher_number, if any — preserved when this row's source report has no Voucher column at all (e.g. Baseline import). */
  existingVoucherNumber: string | null;
}

export interface ImportPreview {
  importKind: ImportKind;
  fileName: string;
  totalRows: number;
  counts: {
    new: number;
    updated: number;
    unchanged: number;
    unmatchedVilla: number;
    unmatchedChannel: number;
    errors: number;
  };
  rows: ResolvedRow[];
}
