-- Day 3: schema support for the financial engine.

-- Fix: the Day-2 seed migration gave every villa's "standard" tax
-- profile assignment an effective_from of 2026-08-01 (the confirmed
-- Bracha cutover date). That date only bounds Bracha's legacy→standard
-- transition (FINANCIAL_LOGIC.md §3) — every other villa was always on
-- standard treatment and has no cutover at all. Left as seeded, any
-- stay date before 2026-08-01 for a non-Bracha villa would have no
-- resolvable tax profile. Corrected to the same "effective since
-- always" epoch used elsewhere (channel_payment_rules defaults).
update villa_tax_profile_assignments a
set effective_from = date '2020-01-01'
where a.effective_from = date '2026-08-01'
  and a.villa_id not in (select id from villas where villa_code in ('BRC1','BRC2','BRC3'));

-- IMPORT_LOGIC.md §3: a Room Revenue row whose Reservation Number
-- doesn't exist yet must still be stored (raising
-- DAILY_REVENUE_WITHOUT_BOOKING), not dropped — requires reservation_id
-- to be nullable. villa_id is resolved independently via
-- room_villa_mapping so the row is still usable/reportable.
alter table daily_revenue alter column reservation_id drop not null;

-- FINANCIAL_LOGIC.md §3: the retired Bracha legacy profile applies an
-- additional 21%-inclusive service-charge extraction
-- (amount - amount/1.21) on top of ordinary channel commission/VAT —
-- confirmed against a real ROOM REV row (1,040,260 -> 180,540.99
-- extracted). DATA_MODEL.md's daily_revenue listing has no column for
-- this distinct from `commission`, but collapsing it into commission
-- would misrepresent an OTA's actual commission line when drilling
-- down. Added as its own column so net_revenue stays fully traceable:
-- net_revenue = commercial_revenue_basis_amount - commission -
-- commission_vat - service_charge_extraction - pb1.
alter table daily_revenue add column service_charge_extraction numeric not null default 0;

-- Idempotency for rows with no matched reservation (reservation_id is
-- null, so the existing (reservation_id, stay_date, revenue_type)
-- unique constraint never fires for them — NULL never equals NULL).
create unique index daily_revenue_unmatched_dedupe
  on daily_revenue (villa_id, stay_date, revenue_type, room_number)
  where reservation_id is null;

-- CLAUDE.md rule 20 / FINANCIAL_LOGIC.md §5: a reservation with no
-- resolvable channel_payment_rule must have its commission/VAT/PB1/net
-- figures "unset and marked incomplete/not final" — distinct from a
-- correctly-computed zero (e.g. an already-net OTA channel legitimately
-- has commission = 0). NOT NULL DEFAULT 0 can't represent that
-- distinction, so these become nullable; null means "not yet computed",
-- never a value to sum into a finalized total.
alter table daily_revenue
  alter column commission drop not null,
  alter column commission drop default,
  alter column commission_vat drop not null,
  alter column commission_vat drop default,
  alter column pb1 drop not null,
  alter column pb1 drop default,
  alter column net_revenue drop not null,
  alter column net_revenue drop default,
  alter column service_charge_extraction drop not null,
  alter column service_charge_extraction drop default;

