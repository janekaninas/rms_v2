-- Consolidates every individual travel-agency channel into one canonical
-- "Travel Agent" channel — Jane's explicit instruction: only real OTAs
-- (Airbnb, Booking.com, Agoda, etc.) should be distinct channels; travel
-- agents share the same handling as Direct bookings (FINANCIAL_LOGIC.md
-- §7a's confirmed Direct/Individual/Travel-Agent regime already treats
-- them identically for revenue allocation) and none of them carry their
-- own channel_payment_rules or OTA-style settlement data, so there is no
-- financial-logic reason for each agency to be its own channel identity.
--
-- Reuses the existing "OTHER TRAVEL AGENT" channel as the canonical row
-- (renamed) rather than creating a new one — it already carried zero
-- reservations/settlement data of its own and already meant "a travel
-- agent not otherwise individually identified," which is exactly what
-- every travel agent becomes after this migration.
--
-- Every individual agency's raw name becomes a channel_raw_alias pointing
-- at the canonical channel, so a booking imported with e.g. raw_name
-- "BALI AERO TRAVEL" still resolves correctly (src/lib/import/resolve.ts's
-- exact-match-then-alias lookup) without needing a distinct channel row.
-- Existing reservations/settlement batches/aliases already tied to an
-- individual agency are reassigned to the canonical channel, and the old
-- rows are deactivated (never deleted — same conservative precedent as
-- villa deactivation, CLAUDE.md rule 15's spirit) so historical data and
-- any old direct link remains intact and reversible.
--
-- Looked up by raw_name (never by a hardcoded UUID) so this runs
-- correctly against any environment's own independently-seeded channel
-- IDs, local or production.

do $$
declare
  canonical_id uuid;
  merge_names text[] := array[
    '4 SQUARE', 'AL FURSAN TRAVEL', 'ALIHUDA TOUR & TRAVEL', 'BALI AERO TRAVEL',
    'BALI BLING TRAVEL', 'BALI EUPHORIA', 'BALI HIJAU ALAMI', 'BALI SUCI TOUR',
    'BALI TOUR', 'BALI TRAVEL LIFE', 'CCI TRAVEL', 'CHARMING HOLIDAYS',
    'CONVERGENT', 'DAMAI VILLA MANAGEMENT', 'DIDA TRAVEL', 'EKAJAYA BALIWISATA',
    'ILYS COLLECTION', 'KOSABI', 'LH TRAVEL', 'LUXURY', 'NUSANTARA', 'OHANA',
    'RAMAYANA TRAVEL', 'RASYID TRAVEL', 'TRAVELLING COMPASS'
  ];
  old_id uuid;
  n text;
begin
  select id into canonical_id from channels where raw_name = 'OTHER TRAVEL AGENT';
  if canonical_id is null then
    raise exception 'Canonical "OTHER TRAVEL AGENT" channel not found — aborting travel-agent consolidation.';
  end if;

  update channels set raw_name = 'TRAVEL AGENT', display_name = 'Travel Agent' where id = canonical_id;

  foreach n in array merge_names loop
    select id into old_id from channels where raw_name = n;
    if old_id is null then
      continue; -- this environment never had this agency configured — nothing to merge
    end if;
    if old_id = canonical_id then
      continue;
    end if;

    insert into channel_raw_aliases (channel_id, raw_value)
    values (canonical_id, n)
    on conflict (raw_value) do nothing;

    update channel_raw_aliases set channel_id = canonical_id where channel_id = old_id;
    update reservations set channel_id = canonical_id where channel_id = old_id;
    update ota_settlement_batches set channel_id = canonical_id where channel_id = old_id;
    update channel_payment_rules set channel_id = canonical_id where channel_id = old_id;
    -- ota_settlement_import_configs is unique on channel_id — a travel
    -- agent never has one (they don't go through OTA-style settlement
    -- upload), so there is nothing to reassign or conflict on here.

    update channels set active = false where id = old_id;
  end loop;
end;
$$;
