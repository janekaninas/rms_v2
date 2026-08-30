-- Day 1: seed the confirmed configuration values from FINANCIAL_LOGIC.md §6/§10
-- and DATA_MODEL.md §1/§4/§9. These are real, confirmed business rules —
-- not placeholders or invented defaults (CLAUDE.md rules 2/4/17/19).
--
-- Deliberately NOT seeded here: any villa rows. The docs do not provide a
-- real 33-villa list (only "Bracha" is named as a group), so villas are
-- added through the Configuration UI or the Day 2 baseline import —
-- never hardcoded or fabricated (CLAUDE.md rule 8).

insert into villa_groups (name, notes) values
  ('Bracha', 'Villa group used for Bracha-specific Booking.com payment/tax rules (FINANCIAL_LOGIC.md §3/§6).');

insert into villa_tax_profiles (name, pb1_applicable, service_charge_extraction_pct, notes) values
  ('standard', true, null,
   'Current default profile for every villa, Bracha included, from 2026-08-01 onward (FINANCIAL_LOGIC.md §3).'),
  ('bracha_legacy_21pct', false, 0.21,
   'Retired historical profile. Applies only to Bracha villas for stay dates through 2026-07-31 inclusive, preserved so historical-period reports still reproduce the legacy workbook''s numbers (FINANCIAL_LOGIC.md §3).');

insert into channels (raw_name, display_name, channel_type) values
  ('BOOKING.COM', 'Booking.com', 'OTA'),
  ('EXPEDIA', 'Expedia', 'OTA'),
  ('AGODA', 'Agoda', 'OTA'),
  ('AIRBNB', 'Airbnb', 'OTA'),
  ('TRIP.COM', 'Trip.com', 'OTA'),
  ('TIKET.COM', 'Tiket.com', 'OTA');

-- Channel-wide default rules use 2020-01-01 as an "effective since always"
-- epoch — a technical convention for the effective-dating column, not a
-- business claim about when these rates actually started. Only the Bracha
-- cutover has a real confirmed start date (2026-08-01).
insert into channel_payment_rules (
  channel_id, villa_group_id, source_amount_basis, payment_model,
  commission_rate, payment_service_fee_rate, commission_vat_rate,
  pb1_withheld_by_ota, effective_from, notes
)
select
  c.id, g.id, 'GROSS_BEFORE_OTA_DEDUCTIONS', 'GROSS_REMITTANCE_INVOICE_LATER',
  0.18, null, 0.11, false, date '2026-08-01',
  'Confirmed Bracha Booking.com rule (FINANCIAL_LOGIC.md §2/§6). Gross remittance, commission invoiced separately.'
from channels c, villa_groups g
where c.raw_name = 'BOOKING.COM' and g.name = 'Bracha';

insert into channel_payment_rules (
  channel_id, source_amount_basis, payment_model,
  commission_rate, payment_service_fee_rate, commission_vat_rate,
  pb1_withheld_by_ota, effective_from, notes
)
select c.id, 'GROSS_BEFORE_OTA_DEDUCTIONS'::source_amount_basis_enum, 'NET_REMITTANCE'::payment_model_enum, 0.15, 0.023, 0.11, false, date '2020-01-01',
  'Confirmed non-Bracha Booking.com rule, matches real settlement example (FINANCIAL_LOGIC.md §2).'
from channels c where c.raw_name = 'BOOKING.COM'
union all
select c.id, 'GROSS_BEFORE_OTA_DEDUCTIONS'::source_amount_basis_enum, 'GROSS_REMITTANCE_INVOICE_LATER'::payment_model_enum, 0.15, null, 0.11, false, date '2020-01-01',
  'Confirmed Expedia rule: gross remittance, invoiced separately (FINANCIAL_LOGIC.md §6).'
from channels c where c.raw_name = 'EXPEDIA'
union all
select c.id, 'NET_AFTER_OTA_DEDUCTIONS'::source_amount_basis_enum, 'NET_REMITTANCE'::payment_model_enum, 0, null, 0.11, false, date '2020-01-01',
  'PMS figure already net of OTA commission — no further deduction (FINANCIAL_LOGIC.md §2/§6).'
from channels c where c.raw_name = 'AGODA'
union all
select c.id, 'NET_AFTER_OTA_DEDUCTIONS'::source_amount_basis_enum, 'NET_REMITTANCE'::payment_model_enum, 0, null, 0.11, false, date '2020-01-01',
  'PMS figure already net of OTA commission — no further deduction (FINANCIAL_LOGIC.md §2/§6).'
from channels c where c.raw_name = 'AIRBNB'
union all
select c.id, 'NET_AFTER_OTA_DEDUCTIONS'::source_amount_basis_enum, 'NET_REMITTANCE'::payment_model_enum, 0, null, 0.11, false, date '2020-01-01',
  'PMS figure already net of OTA commission — no further deduction (FINANCIAL_LOGIC.md §2/§6).'
from channels c where c.raw_name = 'TRIP.COM'
union all
select c.id, 'NET_AFTER_OTA_DEDUCTIONS'::source_amount_basis_enum, 'NET_REMITTANCE'::payment_model_enum, 0, null, 0.11, false, date '2020-01-01',
  'PMS figure already net of OTA commission — no further deduction (FINANCIAL_LOGIC.md §2/§6).'
from channels c where c.raw_name = 'TIKET.COM';

-- Explicit, independently-configured portfolio target (CLAUDE.md rule 17) —
-- never derived from villa-level targets.
insert into revenue_targets (villa_id, year, month, revenue_target, notes)
values (
  null, 2026, 8, 1500000000,
  'Confirmed explicit portfolio target for the 33-villa portfolio (26 Aasha + 7 Balinest). Not derived from villa-level targets and not required to reconcile with their sum (PRODUCT_SPEC.md §1, CLAUDE.md rule 17).'
);
