-- Day 2 (config follow-up): Jane's confirmed channel identity list and the
-- real villa/room structure. This is master-data configuration (CLAUDE.md
-- rule 8), not financial logic — commission/payment-model behavior for
-- these channels is unaffected and still resolved via channel_payment_rules.
--
-- Key correction this migration makes: "Bracha" is not one villa. Jane's
-- room list shows three distinct villa entities under the Bracha property
-- (1BD: rooms 101-110, 2BD: rooms 201-204, 3BD: room 300), all in the
-- Bracha villa_group so the confirmed Bracha Booking.com rule (18%,
-- GROSS_REMITTANCE_INVOICE_LATER, effective 2026-08-01) applies to all
-- three via group-level channel_payment_rules resolution.

-- ---------------------------------------------------------------------
-- 1. Channel raw-text aliases
-- ---------------------------------------------------------------------
-- VHP exposes the same channel under different raw strings depending on
-- report type (e.g. Bookings shows "AGODA", the Arrival/baseline report
-- shows "AGODA, T&T") — confirmed by Jane's own mapping list, not
-- inferred. channels.raw_name stays the single canonical identity;
-- alternate raw forms are recorded here rather than guessed at import
-- time (IMPORT_LOGIC.md §6: channels are configuration, never
-- fuzzy-matched).
create table channel_raw_aliases (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  raw_value text not null,
  created_at timestamptz not null default now(),
  unique (raw_value)
);

alter table channel_raw_aliases enable row level security;
create policy "authenticated_all" on channel_raw_aliases for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 2. Channels
-- ---------------------------------------------------------------------

-- Expedia's canonical raw form is confirmed as "EXPEDIA.COM" (Jane's
-- list), correcting the Day-1 seed's "EXPEDIA" — a rename, not a new
-- channel, so the existing channel_payment_rules row stays attached.
update channels set raw_name = 'EXPEDIA.COM', display_name = 'Expedia.com' where raw_name = 'EXPEDIA';

insert into channels (raw_name, display_name, channel_type) values
  ('INDIVIDUAL', 'Individual', 'DIRECT'),
  ('WEBSITE', 'Website', 'DIRECT'),
  ('STAAH BRACHA', 'Staah Bracha', 'DIRECT'),
  ('STAAH CASA AMANI', 'Staah Casa Amani', 'DIRECT'),
  ('MAKE MY TRIP', 'Make My Trip', 'OTA'),
  ('TRAVELOKA', 'Traveloka', 'OTA'),
  ('BALI SUCI TOUR', 'Bali Suci Tour', 'TRAVEL_AGENT'),
  ('DIDA TRAVEL', 'Dida Travel', 'TRAVEL_AGENT'),
  ('BALI EUPHORIA', 'Bali Euphoria', 'TRAVEL_AGENT'),
  ('ILYS COLLECTION', 'Ilys Collection', 'TRAVEL_AGENT'),
  ('RASYID TRAVEL', 'Rasyid Travel', 'TRAVEL_AGENT'),
  ('EKAJAYA BALIWISATA', 'Ekajaya Baliwisata', 'TRAVEL_AGENT'),
  ('CONVERGENT', 'Convergent', 'TRAVEL_AGENT'),
  ('TRAVELLING COMPASS', 'Travelling Compass', 'TRAVEL_AGENT'),
  ('4 SQUARE', '4 Square', 'TRAVEL_AGENT'),
  ('BALI HIJAU ALAMI', 'Bali Hijau Alami', 'TRAVEL_AGENT'),
  ('OTHER TRAVEL AGENT', 'Other Travel Agent', 'TRAVEL_AGENT'),
  ('LH TRAVEL', 'Lh Travel', 'TRAVEL_AGENT'),
  ('CCI TRAVEL', 'Cci Travel', 'TRAVEL_AGENT'),
  ('LUXURY', 'Luxury', 'TRAVEL_AGENT'),
  ('KOSABI', 'Kosabi', 'TRAVEL_AGENT'),
  ('CHARMING HOLIDAYS', 'Charming Holidays', 'TRAVEL_AGENT'),
  ('RAMAYANA TRAVEL', 'Ramayana Travel', 'TRAVEL_AGENT'),
  ('BALI AERO TRAVEL', 'Bali Aero Travel', 'TRAVEL_AGENT'),
  ('BALI TRAVEL LIFE', 'Bali Travel Life', 'TRAVEL_AGENT'),
  ('OHANA', 'Ohana', 'TRAVEL_AGENT'),
  ('NUSANTARA', 'Nusantara', 'TRAVEL_AGENT'),
  ('ALIHUDA TOUR & TRAVEL', 'Alihuda Tour & Travel', 'TRAVEL_AGENT'),
  ('BALI TOUR', 'Bali Tour', 'TRAVEL_AGENT'),
  ('BALI BLING TRAVEL', 'Bali Bling Travel', 'TRAVEL_AGENT'),
  ('AL FURSAN TRAVEL', 'Al Fursan Travel', 'TRAVEL_AGENT'),
  ('DAMAI VILLA MANAGEMENT', 'Damai Villa Management', 'TRAVEL_AGENT')
on conflict (raw_name) do nothing;

-- Alternate raw-text forms (the "Company / Agent Name" field format),
-- wherever they differ from the canonical raw_name above.
insert into channel_raw_aliases (channel_id, raw_value)
select c.id, a.raw_value
from (values
  ('INDIVIDUAL', '[INDIVIDUAL RESERVATION],'),
  ('WEBSITE', 'Website,'),
  ('STAAH BRACHA', '[STAAH BRACHA], T&T'),
  ('STAAH CASA AMANI', '[STAAH CASA AMANI], T&T'),
  ('AGODA', 'AGODA, T&T'),
  ('BOOKING.COM', 'Booking.Com, T&T'),
  ('EXPEDIA.COM', 'Expedia.com, T&T'),
  ('MAKE MY TRIP', 'Make My Trip,'),
  ('TIKET.COM', 'tiket.com, T&T'),
  ('TRAVELOKA', 'Traveloka, T&T'),
  ('TRIP.COM', 'Trip.Com, T&T'),
  ('AIRBNB', 'Airbnb, T&T'),
  ('BALI SUCI TOUR', 'Bali Suci Tour, T&T'),
  ('DIDA TRAVEL', 'Dida Travel , T&T'),
  ('BALI EUPHORIA', 'Bali Euphoria, T&T'),
  ('ILYS COLLECTION', 'Ilys Colection,'),
  ('RASYID TRAVEL', 'Rasyid Travel,'),
  ('RASYID TRAVEL', 'Rasyid , T&T'),
  ('EKAJAYA BALIWISATA', 'Ekajaya Baliwisata ,'),
  ('CONVERGENT', 'Convergent,'),
  ('TRAVELLING COMPASS', 'Travelling Compass ,'),
  ('4 SQUARE', '4 Sequare, T&T'),
  ('BALI HIJAU ALAMI', 'Bali Hijau Alami , T&T'),
  ('OTHER TRAVEL AGENT', 'Other Travel Agent,'),
  ('LH TRAVEL', 'LH Travel, T&T'),
  ('CCI TRAVEL', 'CCI Travel, T&T'),
  ('LUXURY', 'Luxury , T&T'),
  ('KOSABI', 'Kosabi , T&T'),
  ('CHARMING HOLIDAYS', 'Charming Holidays, T&T'),
  ('RAMAYANA TRAVEL', 'Ramayana Travel ,'),
  ('BALI AERO TRAVEL', 'Bali Aero Travel ,'),
  ('BALI TRAVEL LIFE', 'Bali Travel Life,'),
  ('OHANA', 'Ohana,'),
  ('NUSANTARA', 'NUSANTARA, T&T'),
  ('ALIHUDA TOUR & TRAVEL', 'Alhuda Tour & Travel, T&T'),
  ('BALI TOUR', 'Mr. Bali Tour ,'),
  ('BALI TOUR', 'Mr Bali Tour, T&T'),
  ('BALI BLING TRAVEL', 'Bali Bling Travel , T&T'),
  ('AL FURSAN TRAVEL', 'Al Fursan Travel, T&T'),
  ('DAMAI VILLA MANAGEMENT', 'Damai Villa Management,')
) as a(canonical_raw_name, raw_value)
join channels c on c.raw_name = a.canonical_raw_name
on conflict (raw_value) do nothing;

-- ---------------------------------------------------------------------
-- 3. Villas
-- ---------------------------------------------------------------------
-- management_start_date uses the same 2020-01-01 "effective since
-- always" placeholder convention as the Day-1 channel_payment_rules
-- defaults, pending Jane's real per-villa management start dates —
-- flagged explicitly, not a confirmed value.
insert into villas (villa_code, name, portfolio, unit_count, management_start_date, villa_group_id)
select v.villa_code, v.name, v.portfolio::portfolio_enum, v.unit_count, date '2020-01-01', g.id
from (values
  ('BRC1', 'Bracha 1BD', 'AASHA', 10, 'Bracha'),
  ('BRC2', 'Bracha 2BD', 'AASHA', 4, 'Bracha'),
  ('BRC3', 'Bracha 3BD', 'AASHA', 1, 'Bracha')
) as v(villa_code, name, portfolio, unit_count, group_name)
join villa_groups g on g.name = v.group_name
on conflict (villa_code) do nothing;

insert into villas (villa_code, name, portfolio, unit_count, management_start_date)
values
  ('AMDB5B', 'Casa Amadeo B5B', 'AASHA', 1, '2020-01-01'),
  ('AMN1', 'Casa Amani 1', 'AASHA', 1, '2020-01-01'),
  ('AMN2', 'Casa Amani 2', 'AASHA', 1, '2020-01-01'),
  ('AMN3', 'Casa Amani 3', 'AASHA', 1, '2020-01-01'),
  ('C128E', 'Villa 128 E', 'AASHA', 1, '2020-01-01'),
  ('C128F', 'Villa 128 F', 'AASHA', 1, '2020-01-01'),
  ('CDF1', 'Casa de Fiero 1', 'AASHA', 1, '2020-01-01'),
  ('CDF2', 'Casa de Fiero 2', 'AASHA', 1, '2020-01-01'),
  ('CDF7', 'Casa de Fiero 7', 'AASHA', 1, '2020-01-01'),
  ('RISO', 'Villa Riso', 'AASHA', 1, '2020-01-01'),
  ('AMDA6', 'Casa Amadeo A6', 'AASHA', 1, '2020-01-01'),
  ('AMDA2', 'Casa Amadeo A2', 'BALINEST', 1, '2020-01-01'),
  ('AMDA3', 'Casa Amadeo A3', 'BALINEST', 1, '2020-01-01'),
  ('AMDA4', 'Casa Amadeo A4', 'BALINEST', 1, '2020-01-01'),
  ('AMDB2', 'Casa Amadeo B2', 'BALINEST', 1, '2020-01-01'),
  ('AMDB5A', 'Casa Amadeo B5A', 'BALINEST', 1, '2020-01-01'),
  ('CDF4', 'Casa de Fiero 4', 'BALINEST', 1, '2020-01-01'),
  ('TOVE', 'Casa Tove', 'BALINEST', 1, '2020-01-01')
on conflict (villa_code) do nothing;

-- ---------------------------------------------------------------------
-- 4. Room / listing mapping
-- ---------------------------------------------------------------------
insert into room_villa_mapping (portfolio, match_type, raw_value, villa_id, priority)
select 'AASHA'::portfolio_enum, 'ROOM_NUMBER'::match_type_enum, m.raw_value, v.id, 10
from (values
  ('101','BRC1'),('102','BRC1'),('103','BRC1'),('104','BRC1'),('105','BRC1'),
  ('106','BRC1'),('107','BRC1'),('108','BRC1'),('109','BRC1'),('110','BRC1'),
  ('201','BRC2'),('202','BRC2'),('203','BRC2'),('204','BRC2'),
  ('300','BRC3')
) as m(raw_value, villa_code)
join villas v on v.villa_code = m.villa_code
on conflict do nothing;

insert into room_villa_mapping (portfolio, match_type, raw_value, villa_id, priority)
select 'AASHA'::portfolio_enum, 'ROOM_TYPE'::match_type_enum, m.raw_value, v.id, 0
from (values
  ('1BRS','BRC1'),('1BRD','BRC1'),
  ('2BR','BRC2'),
  ('3BR','BRC3')
) as m(raw_value, villa_code)
join villas v on v.villa_code = m.villa_code
on conflict do nothing;

-- Standalone villas: Room Number = Room Type = the villa's own code
-- (confirmed by Jane's list) — one mapping row of each match_type is
-- enough since both fields carry the same value for these properties.
insert into room_villa_mapping (portfolio, match_type, raw_value, villa_id, priority)
select 'AASHA'::portfolio_enum, mt.match_type, v.villa_code, v.id, 10
from villas v
cross join (values ('ROOM_NUMBER'::match_type_enum), ('ROOM_TYPE'::match_type_enum)) as mt(match_type)
where v.villa_code in ('AMDB5B','AMN1','AMN2','AMN3','C128E','C128F','CDF1','CDF2','CDF7','RISO','AMDA6')
on conflict do nothing;

insert into room_villa_mapping (portfolio, match_type, raw_value, villa_id, priority)
select 'BALINEST'::portfolio_enum, 'LISTING'::match_type_enum, m.raw_value, v.id, 10
from (values
  ('Amadeo A4 / Casa Amadeo A4- 3BR Villa near Seminyak Beach', 'AMDA4'),
  ('Amadeo B2 / Casa Amadeo B2 - 3BR Villa near Seminyak Beach', 'AMDB2'),
  ('Amadeo B5A / Casa Amadeo B5A - 3BR Villa near Seminyak Beach', 'AMDB5A'),
  ('Amadeo A3 / Casa Amadeo A3 - 3BR Villa near Seminyak Beach', 'AMDA3'),
  ('Casa Fierro A4 / Casa De Fiero A4: 2BR Villa w/ Pool In Seminyak', 'CDF4'),
  ('Amadeo A2 / Casa Amadeo A2 - 3BR Villa near Seminyak Beach', 'AMDA2'),
  ('Casa Tove / Casa Tove - 2BR Mediterranean Villa in Uluwatu', 'TOVE')
) as m(raw_value, villa_code)
join villas v on v.villa_code = m.villa_code
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 5. Tax profile assignments (Aasha only — FINANCIAL_LOGIC.md §9:
-- Balinest confirmations are explicitly not ported without asking)
-- ---------------------------------------------------------------------
insert into villa_tax_profile_assignments (villa_id, tax_profile_id, effective_from, effective_to, notes)
select v.id, p.id, date '2026-08-01', null,
  'Seeded alongside confirmed channel/villa master data per the standard cutover rule.'
from villas v, villa_tax_profiles p
where v.portfolio = 'AASHA' and p.name = 'standard'
on conflict do nothing;

insert into villa_tax_profile_assignments (villa_id, tax_profile_id, effective_from, effective_to, notes)
select v.id, p.id, v.management_start_date, date '2026-07-31',
  'Seeded alongside confirmed channel/villa master data: retired Bracha legacy profile before the confirmed cutover.'
from villas v, villa_tax_profiles p
where v.villa_code in ('BRC1','BRC2','BRC3') and p.name = 'bracha_legacy_21pct'
on conflict do nothing;
