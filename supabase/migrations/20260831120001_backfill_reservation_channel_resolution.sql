-- Data backfill: a handful of reservations were imported before the
-- confirmed channel master data (and its raw-text aliases) existed, so
-- their channel_id is still null even though the raw channel string
-- (preserved in the open UNKNOWN_CHANNEL reconciliation_exceptions row)
-- now resolves. Villa resolution was backfilled the same way via a
-- one-off production query; this migration records the equivalent
-- channel backfill so it's reproducible and not just a manual edit.
-- Harmless/no-op on a fresh database (no reservations exist yet).

update reservations r
set channel_id = coalesce(
    (select c.id from channels c
       where upper(trim(c.raw_name)) = upper(trim(e.detail->>'channelRawName'))
       order by c.raw_name limit 1),
    (select a.channel_id from channel_raw_aliases a
       where upper(trim(a.raw_value)) = upper(trim(e.detail->>'channelRawName'))
       order by a.raw_value limit 1)
  )
from reconciliation_exceptions e
where e.reservation_id = r.id
  and e.type = 'UNKNOWN_CHANNEL'
  and e.status = 'OPEN'
  and r.channel_id is null;

-- Villa resolution was backfilled directly in production already
-- (villa_id is nullable and simply filled in where it now resolves);
-- included here too so a fresh database ends up in the same state.
update reservations r
set villa_id = coalesce(
    (select m.villa_id from room_villa_mapping m
       where m.portfolio = r.portfolio and m.match_type = 'ROOM_NUMBER' and m.raw_value = r.room_number
       limit 1),
    (select m.villa_id from room_villa_mapping m
       where m.portfolio = r.portfolio and m.match_type = 'ROOM_TYPE' and m.raw_value = r.room_type
       limit 1)
  )
where r.villa_id is null;

-- Close the reconciliation exceptions that are now actually resolved —
-- never left open once the underlying condition no longer holds.
update reconciliation_exceptions e
set status = 'RESOLVED', resolved_at = now(),
    resolution_notes = 'Auto-resolved: confirmed channel/villa master data added, reservation re-resolved.'
from reservations r
where e.reservation_id = r.id
  and e.type = 'UNKNOWN_VILLA'
  and e.status = 'OPEN'
  and r.villa_id is not null;

update reconciliation_exceptions e
set status = 'RESOLVED', resolved_at = now(),
    resolution_notes = 'Auto-resolved: confirmed channel/villa master data added, reservation re-resolved.'
from reservations r
where e.reservation_id = r.id
  and e.type = 'UNKNOWN_CHANNEL'
  and e.status = 'OPEN'
  and r.channel_id is not null;
