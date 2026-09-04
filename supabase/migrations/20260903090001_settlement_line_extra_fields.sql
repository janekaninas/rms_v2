-- Day 5 follow-up: preserve extra per-line fields for drill-down that
-- real OTA settlement files carry beyond the core mapped columns (e.g.
-- Booking.com's Commission/VAT/Payment Service Fee/Payment status/
-- Reservation status; Airbnb's Service fee/Gross earnings/Booking date/
-- Start-End date/Nights/Listing). Generic JSONB rather than one column
-- per field, since the exact set is per-channel and configured through
-- the Settlement Upload mapping UI (ota_settlement_import_configs),
-- never hardcoded per OTA (IMPORT_LOGIC.md §8 pt.1). Purely additive.

alter table ota_settlement_lines add column extra_fields jsonb;
