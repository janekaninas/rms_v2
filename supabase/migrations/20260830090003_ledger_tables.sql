-- Day 1: schema for the reservation/revenue ledger and import audit trail.
-- Per IMPLEMENTATION_PLAN.md's Day 1 bullet, this schema is migrated now so
-- it doesn't block Day 2 (imports) / Day 3 (financial engine), but no rows
-- are seeded here — these tables stay empty until Day 2's import work.
-- See docs/DATA_MODEL.md §2, §3, §5, §8.

create table imports (
  id uuid primary key default gen_random_uuid(),
  import_type import_type_enum not null,
  filename text not null,
  uploaded_at timestamptz not null default now(),
  row_count integer not null default 0,
  new_count integer not null default 0,
  updated_count integer not null default 0,
  ignored_count integer not null default 0,
  unmatched_count integer not null default 0,
  error_count integer not null default 0,
  status import_status_enum not null default 'PENDING_REVIEW',
  raw_file_ref text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table import_row_errors (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null,
  error_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index import_row_errors_import_idx on import_row_errors (import_id);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_number text not null,
  portfolio portfolio_enum not null,
  channel_id uuid not null references channels(id),
  -- nullable + reconciliation flag if unresolved (DATA_MODEL.md §2 UNKNOWN_VILLA)
  villa_id uuid references villas(id),
  room_number text,
  room_type text,
  guest_name text,
  booking_date date,
  arrival_date date not null,
  departure_date date not null,
  nights integer not null,
  adults integer,
  children integer,
  status reservation_status_enum not null default 'ACTIVE',
  system_gross_revenue numeric,
  manual_revenue_override numeric,
  override_status override_status_enum not null default 'NONE',
  -- Derived: override value if APPROVED, else system_gross_revenue.
  -- Computed in the application layer (financial engine, Day 3) rather
  -- than as a generated column, since the derivation depends on the
  -- related revenue_overrides row, not just this row's own fields.
  final_gross_revenue numeric,
  -- Null/unset whenever no channel_payment_rules row resolves for this
  -- reservation (MISSING_PAYMENT_RULE, CLAUDE.md rule 20) — never a
  -- guessed value. Populated by the Day 3 financial engine.
  expected_settlement_amount numeric,
  expected_settlement_rule_id uuid references channel_payment_rules(id),
  source_file_import_id uuid references imports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio, reservation_number)
);

create index reservations_villa_dates_idx on reservations (villa_id, arrival_date, departure_date);
create index reservations_status_idx on reservations (status);

create trigger reservations_set_updated_at
  before update on reservations
  for each row execute function set_updated_at();

create table reservation_status_history (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  status reservation_status_enum not null,
  effective_at timestamptz not null,
  reason text,
  source_import_id uuid references imports(id),
  created_at timestamptz not null default now()
);

create index reservation_status_history_reservation_idx
  on reservation_status_history (reservation_id);

create table daily_revenue (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  villa_id uuid not null references villas(id),
  stay_date date not null,
  room_number text,
  revenue_type revenue_type_enum not null default 'STAY',
  revenue_source_status revenue_source_status_enum not null default 'ACTUAL_ROOM_REVENUE',
  -- Renamed from gross_revenue (DATA_MODEL.md §2 v0.5): may be gross or
  -- already-net depending on the channel's source_amount_basis.
  commercial_revenue_basis_amount numeric not null,
  commission numeric not null default 0,
  commission_vat numeric not null default 0,
  pb1 numeric not null default 0,
  net_revenue numeric not null default 0,
  source_import_id uuid references imports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, stay_date, revenue_type)
);

create index daily_revenue_villa_date_idx on daily_revenue (villa_id, stay_date);
create index daily_revenue_stay_date_idx on daily_revenue (stay_date);

create trigger daily_revenue_set_updated_at
  before update on daily_revenue
  for each row execute function set_updated_at();

create table revenue_overrides (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  system_revenue numeric not null,
  manual_revenue numeric not null,
  final_revenue numeric not null,
  status override_status_enum not null default 'PENDING',
  notes text,
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (reservation_id)
);

create table reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  type reconciliation_exception_type_enum not null,
  reservation_id uuid references reservations(id),
  daily_revenue_id uuid references daily_revenue(id),
  detected_at timestamptz not null default now(),
  status reconciliation_exception_status_enum not null default 'OPEN',
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_notes text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index reconciliation_exceptions_status_idx on reconciliation_exceptions (status);
create index reconciliation_exceptions_type_idx on reconciliation_exceptions (type);
