export type ImportKind = "BASELINE_RESERVATION_SNAPSHOT" | "NEW_BOOKINGS" | "CANCELLATIONS";

export interface NormalizedReservationRow {
  sourceRowNumber: number;
  reservationNumber: string;
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
