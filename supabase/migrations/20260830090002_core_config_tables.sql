-- Day 1: villas, owners, portfolio structure, channels, payment rules,
-- revenue targets. See docs/DATA_MODEL.md §1, §2 (channels/room mapping),
-- §4 (channel_payment_rules), §9 (revenue_targets).

-- Minimal stub: full business_units model is Phase 2 (DATA_MODEL.md §13).
-- Only exists here so villas.business_unit_id has something to reference.
create table business_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,
  created_at timestamptz not null default now()
);

create table villa_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,
  created_at timestamptz not null default now()
);

create table owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  contact_phone text,
  -- Free-text payout reference until/unless a full external-bank-account
  -- model for owners is needed — DATA_MODEL.md §1 flags this NEEDS CONFIRMATION.
  default_bank_account_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger owners_set_updated_at
  before update on owners
  for each row execute function set_updated_at();

create table villas (
  id uuid primary key default gen_random_uuid(),
  villa_code text not null unique,
  name text not null,
  portfolio portfolio_enum not null,
  unit_count integer not null default 1,
  owner_id uuid references owners(id),
  active boolean not null default true,
  management_start_date date not null,
  management_end_date date,
  business_unit_id uuid references business_units(id),
  villa_group_id uuid references villa_groups(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint villas_management_dates_check
    check (management_end_date is null or management_end_date >= management_start_date)
);

create index villas_management_dates_idx on villas (management_start_date, management_end_date);
create index villas_active_idx on villas (active);

create trigger villas_set_updated_at
  before update on villas
  for each row execute function set_updated_at();

-- villa_code is write-once: enforced here at the database layer as a
-- safety net alongside the application-layer disabled-field enforcement
-- (CLAUDE.md rule 8 / DATA_MODEL.md §1).
create function prevent_villa_code_change()
returns trigger
language plpgsql
as $$
begin
  if new.villa_code is distinct from old.villa_code then
    raise exception 'villa_code is immutable once assigned (was %, attempted %)', old.villa_code, new.villa_code;
  end if;
  return new;
end;
$$;

create trigger villas_prevent_code_change
  before update on villas
  for each row execute function prevent_villa_code_change();

create table villa_group_members (
  villa_group_id uuid not null references villa_groups(id) on delete cascade,
  villa_id uuid not null references villas(id) on delete cascade,
  primary key (villa_group_id, villa_id)
);

create table villa_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pb1_applicable boolean not null default true,
  service_charge_extraction_pct numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table villa_tax_profile_assignments (
  id uuid primary key default gen_random_uuid(),
  villa_id uuid not null references villas(id) on delete cascade,
  tax_profile_id uuid not null references villa_tax_profiles(id),
  effective_from date not null,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  constraint villa_tax_profile_assignments_dates_check
    check (effective_to is null or effective_to >= effective_from)
);

create index villa_tax_profile_assignments_villa_idx
  on villa_tax_profile_assignments (villa_id, effective_from);

create table channels (
  id uuid primary key default gen_random_uuid(),
  raw_name text not null unique,
  display_name text not null,
  channel_type channel_type_enum not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table channel_payment_rules (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id),
  villa_id uuid references villas(id),
  villa_group_id uuid references villa_groups(id),
  source_amount_basis source_amount_basis_enum not null,
  payment_model payment_model_enum not null,
  commission_rate numeric,
  payment_service_fee_rate numeric,
  commission_vat_rate numeric not null default 0.11,
  pb1_withheld_by_ota boolean not null default false,
  effective_from date not null,
  effective_to date,
  priority integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A rule targets at most one of villa or villa-group, never both
  -- (DATA_MODEL.md §4 resolution order: villa-specific > villa-group > channel-default).
  constraint channel_payment_rules_scope_check
    check (villa_id is null or villa_group_id is null),
  constraint channel_payment_rules_dates_check
    check (effective_to is null or effective_to >= effective_from)
);

create index channel_payment_rules_resolution_idx
  on channel_payment_rules (channel_id, villa_id, villa_group_id, effective_from);

create trigger channel_payment_rules_set_updated_at
  before update on channel_payment_rules
  for each row execute function set_updated_at();

create table room_villa_mapping (
  id uuid primary key default gen_random_uuid(),
  portfolio portfolio_enum not null,
  match_type match_type_enum not null,
  raw_value text not null,
  villa_id uuid not null references villas(id),
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  unique (portfolio, match_type, raw_value)
);

create table revenue_targets (
  id uuid primary key default gen_random_uuid(),
  -- null = explicit portfolio-level target row (DATA_MODEL.md §9) — never
  -- derived by summing villa-level targets (CLAUDE.md rule 17).
  villa_id uuid references villas(id),
  year integer not null,
  month integer not null check (month between 1 and 12),
  revenue_target numeric not null,
  occupancy_target numeric,
  arr_target numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial unique indexes: one portfolio row per month (villa_id is null),
-- one row per villa per month otherwise.
create unique index revenue_targets_portfolio_unique
  on revenue_targets (year, month) where villa_id is null;
create unique index revenue_targets_villa_unique
  on revenue_targets (villa_id, year, month) where villa_id is not null;

create trigger revenue_targets_set_updated_at
  before update on revenue_targets
  for each row execute function set_updated_at();

-- Generic app-level key/value settings. IMPLEMENTATION_PLAN.md's Day 1
-- migration list names a `settings` table without DATA_MODEL.md ever
-- defining its fields (flagged to Jane in the Day 1 report) — this is
-- treated as plain app infrastructure, not a financial-logic table.
create table app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();
