-- Adds the OTA's own booking reference (VHP's "Voucher No" / "Voucher"
-- column, New Bookings and Cancellations exports) as its own field on
-- reservations — confirmed against a real Booking.com settlement file
-- that this, not reservation_number (VHP's own internal sequence number),
-- is what an OTA settlement line's reference column actually matches
-- (e.g. Booking.com's real payout for guest Diana Susanty carries
-- "Booking number" 5003436260, which is her reservation's Voucher No,
-- not her VHP Reservation Number 3140).
--
-- Purely additive — nullable, no backfill possible from data already in
-- the table (the raw Voucher No/Voucher text was never previously
-- captured anywhere, confirmed by investigation, so there is nothing to
-- derive it from for already-imported reservations). Re-uploading an
-- existing New Bookings or Cancellations export after this migration
-- backfills it for already-imported reservations via the normal
-- update-without-duplication import path (matched by reservation_number,
-- no new rows created).
alter table reservations add column voucher_number text;

create index reservations_voucher_number_idx on reservations (voucher_number) where voucher_number is not null;
