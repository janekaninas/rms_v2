-- Day 5: OTA Settlement schema. See docs/DATA_MODEL.md §7 for field
-- definitions and idempotency rules, docs/IMPORT_LOGIC.md §8 for the
-- import framework this supports, docs/REPORTING_LOGIC.md §10 for the
-- Settlement Reconciliation page this feeds.

create type settlement_line_type_enum as enum (
  'BOOKING_PAYOUT', 'ADJUSTMENT', 'REFUND', 'CORRECTION', 'FEE', 'OTHER'
);

create type settlement_matched_status_enum as enum ('UNMATCHED', 'MATCHED', 'PARTIALLY_MATCHED');

create type settlement_allocation_method_enum as enum ('EXACT_MATCH', 'AMOUNT_MATCH', 'MANUAL');

create type settlement_batch_status_enum as enum (
  'PENDING', 'PARTIALLY_SETTLED', 'SETTLED', 'VARIANCE', 'NEEDS_REVIEW'
);

create table ota_settlement_batches (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id),
  source_import_id uuid references imports(id),
  batch_reference text,
  batch_date date not null,
  gross_settlement_amount numeric not null default 0,
  adjustment_amount numeric not null default 0,
  -- gross_settlement_amount + adjustment_amount — the actual amount the
  -- OTA reports paying. Stored (not generated) since it's set directly
  -- from the settlement file/manual entry, not always derivable from the
  -- other two columns alone (e.g. a manually-entered batch may only know
  -- the net figure).
  net_settlement_amount numeric not null default 0,
  currency text not null default 'IDR',
  -- Derived from comparing allocated reservations' expected_settlement_amount
  -- against net_settlement_amount; stored for fast filtering, refreshed on
  -- allocation change (REPORTING_LOGIC.md §10).
  status settlement_batch_status_enum not null default 'PENDING',
  dedupe_hash text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency (DATA_MODEL.md §7, mandatory): natural key when the OTA
-- supplies a stable batch/payout reference, else a deterministic hash of
-- stable batch fields. Re-uploading the same settlement file must never
-- duplicate a batch.
create unique index ota_settlement_batches_ref_unique
  on ota_settlement_batches (channel_id, batch_reference) where batch_reference is not null;
create unique index ota_settlement_batches_hash_unique
  on ota_settlement_batches (channel_id, dedupe_hash) where batch_reference is null and dedupe_hash is not null;
create index ota_settlement_batches_channel_date_idx on ota_settlement_batches (channel_id, batch_date);
create index ota_settlement_batches_status_idx on ota_settlement_batches (status);

create trigger ota_settlement_batches_set_updated_at
  before update on ota_settlement_batches
  for each row execute function set_updated_at();

create table ota_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references ota_settlement_batches(id) on delete cascade,
  line_type settlement_line_type_enum not null default 'BOOKING_PAYOUT',
  -- As printed by the OTA — may not exactly match VHP's reservation_number
  -- format (DATA_MODEL.md §7).
  raw_reservation_reference text,
  description text,
  amount numeric not null,
  matched_status settlement_matched_status_enum not null default 'UNMATCHED',
  external_line_ref text,
  dedupe_hash text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency: a matching line, on re-upload, updates/skips at the line
-- level rather than only the batch level (IMPORT_LOGIC.md §8 pt.3).
create unique index ota_settlement_lines_ref_unique
  on ota_settlement_lines (batch_id, external_line_ref) where external_line_ref is not null;
create unique index ota_settlement_lines_hash_unique
  on ota_settlement_lines (batch_id, dedupe_hash) where external_line_ref is null and dedupe_hash is not null;
create index ota_settlement_lines_batch_idx on ota_settlement_lines (batch_id);
create index ota_settlement_lines_matched_idx on ota_settlement_lines (matched_status);

create trigger ota_settlement_lines_set_updated_at
  before update on ota_settlement_lines
  for each row execute function set_updated_at();

create table settlement_reservation_allocations (
  id uuid primary key default gen_random_uuid(),
  settlement_line_id uuid not null references ota_settlement_lines(id) on delete cascade,
  reservation_id uuid not null references reservations(id),
  allocated_amount numeric not null,
  allocation_method settlement_allocation_method_enum not null,
  -- Required for anything short of an unambiguous exact match
  -- (DATA_MODEL.md §7) — application layer enforces this, not a DB check,
  -- since "required" here means "before a human can call it resolved,"
  -- not "required at insert time" (an EXACT_MATCH auto-allocation has
  -- neither at insert).
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (settlement_line_id, reservation_id)
);

create index settlement_reservation_allocations_reservation_idx
  on settlement_reservation_allocations (reservation_id);

-- `[NEW]` Not in DATA_MODEL.md's original table list, but required by
-- IMPORT_LOGIC.md §8 point 1's explicit instruction: "the mapping itself
-- ... is configuration, stored alongside channels/channel_payment_rules,
-- not hardcoded per file format in application code." Real Airbnb/
-- Booking.com/Expedia settlement export layouts have not been supplied
-- (FINANCIAL_LOGIC.md §10 item 19, still open) — this table is what lets
-- Jane map any actual file's columns once, per channel, through the UI,
-- rather than the application guessing or hardcoding a layout it has
-- never seen.
create table ota_settlement_import_configs (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) unique,
  -- { batchReference?, batchDate, lineType?, reservationReference,
  --   amount, description? } -> source column name, set once via the
  -- Settlement Upload page after a real file is seen.
  column_mapping jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ota_settlement_import_configs_set_updated_at
  before update on ota_settlement_import_configs
  for each row execute function set_updated_at();

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'ota_settlement_batches', 'ota_settlement_lines',
      'settlement_reservation_allocations', 'ota_settlement_import_configs'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "authenticated_all" on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end;
$$;
