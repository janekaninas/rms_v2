-- Day 1: extensions and enum types
-- See docs/DATA_MODEL.md for the authoritative field/type definitions.

create extension if not exists pgcrypto;

create type portfolio_enum as enum ('AASHA', 'BALINEST');

create type match_type_enum as enum ('ROOM_NUMBER', 'ROOM_TYPE', 'LISTING');

create type channel_type_enum as enum ('OTA', 'TRAVEL_AGENT', 'DIRECT');

create type reservation_status_enum as enum ('ACTIVE', 'CANCELLED');

create type override_status_enum as enum ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

create type revenue_type_enum as enum (
  'STAY', 'CANCELLATION_FEE', 'NO_SHOW', 'REFUND', 'ADJUSTMENT'
);

-- ESTIMATED_BOOKED is a query-time-only label (DATA_MODEL.md §9) and is
-- never expected to be written to daily_revenue, but the type is defined
-- for schema fidelity with the source document.
create type revenue_source_status_enum as enum ('ACTUAL_ROOM_REVENUE', 'ESTIMATED_BOOKED');

create type source_amount_basis_enum as enum (
  'GROSS_BEFORE_OTA_DEDUCTIONS', 'NET_AFTER_OTA_DEDUCTIONS'
);

create type payment_model_enum as enum ('NET_REMITTANCE', 'GROSS_REMITTANCE_INVOICE_LATER');

create type import_type_enum as enum (
  'BASELINE_RESERVATION_SNAPSHOT', 'NEW_BOOKINGS', 'CANCELLATIONS',
  'ROOM_REVENUE', 'CHANGE_LOG', 'BALINEST_SNAPSHOT', 'OTA_SETTLEMENT',
  'BANK_MUTATION', 'EXPENSE'
);

create type import_status_enum as enum ('PENDING_REVIEW', 'COMMITTED', 'FAILED');

create type reconciliation_exception_type_enum as enum (
  'BOOKING_WITHOUT_DAILY_REVENUE', 'DAILY_REVENUE_WITHOUT_BOOKING',
  'ROOM_CHANGE_DETECTED', 'ARRIVAL_DEPARTURE_MISMATCH', 'DUPLICATE_RESERVATION',
  'UNKNOWN_VILLA', 'UNKNOWN_CHANNEL', 'MISSING_PAYMENT_RULE',
  'MANUAL_REVENUE_OVERRIDE_PENDING', 'AMBIGUOUS_CHANGE_LOG_EVENT',
  'PRICE_CHECK_MISMATCH', 'BALINEST_MANAGEMENT_FEE_UNRESOLVED'
);

create type reconciliation_exception_status_enum as enum ('OPEN', 'RESOLVED', 'IGNORED');

-- Shared trigger function to maintain updated_at columns.
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
