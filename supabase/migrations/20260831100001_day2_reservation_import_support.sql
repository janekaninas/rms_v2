-- Day 2: schema corrections + config needed for the reservation import framework.

-- IMPORT_LOGIC.md §1 is explicit and repeated (also §6, §11): an unresolved
-- channel lookup "does not fail the import — it commits with a null
-- reference and immediately raises a reconciliation_exceptions row
-- (UNKNOWN_CHANNEL)". DATA_MODEL.md §2's table listing left channel_id
-- without a "nullable" annotation (unlike villa_id, which explicitly has
-- one for the identical reason) — read together with IMPORT_LOGIC.md's
-- repeated, explicit behavior, this is treated as an oversight in that
-- listing rather than a deliberate stricter rule for channel_id alone,
-- and corrected here so UNKNOWN_CHANNEL can actually be represented.
alter table reservations alter column channel_id drop not null;

-- IMPORT_LOGIC.md §1 confirms a specific resolution rule: a blank
-- Reservation Name resolves to "Direct", not to UNKNOWN_CHANNEL. That
-- rule presupposes a config row to resolve to. Channels remain pure
-- configuration (CLAUDE.md rule 8) — this seeds only the one row the
-- already-confirmed rule requires, not any specific travel-agent/OTA
-- channel observed in real export data (those still resolve through
-- normal UNKNOWN_CHANNEL handling until Jane configures them).
insert into channels (raw_name, display_name, channel_type)
values ('DIRECT', 'Direct', 'DIRECT')
on conflict (raw_name) do nothing;

-- IMPORT_LOGIC.md §2: "re-processing the same cancellation twice...
-- must not create duplicate history rows for the same (reservation_id,
-- effective_at)" — mandatory idempotency, enforced here rather than by
-- an application-side existence check per row.
alter table reservation_status_history
  add constraint reservation_status_history_dedupe unique (reservation_id, status, effective_at);

