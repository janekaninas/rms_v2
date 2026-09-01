-- Confirmed nightly allocation regimes (FINANCIAL_LOGIC.md §7a): the
-- Booking/Arrival Report total is the fixed authoritative reservation
-- total for OTA bookings from the moment it's known; Room Revenue
-- Breakdown only ever clarifies the nightly allocation, never the total.
-- A new exception type surfaces the case where a fully-resolved
-- reservation's actual nights don't sum back to that total.
alter type reconciliation_exception_type_enum add value 'ROOM_REVENUE_TOTAL_MISMATCH';
