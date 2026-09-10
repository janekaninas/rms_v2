-- Day 6: Bank Reconciliation schema. See docs/DATA_MODEL.md §6 for field
-- definitions and idempotency rules, docs/IMPORT_LOGIC.md §9 for the BCA
-- bank mutation import this supports, docs/REPORTING_LOGIC.md §11 for the
-- Bank Reconciliation page this feeds.

create type bank_transaction_status_enum as enum (
  'UNMATCHED', 'PARTIALLY_MATCHED', 'MATCHED', 'NEEDS_REVIEW'
);

create type bank_match_method_enum as enum (
  'EXACT_AMOUNT', 'REFERENCE_MATCH', 'AMOUNT_AND_DATE_PROXIMITY', 'MANUAL'
);

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  -- BCA is the confirmed first bank-reconciliation source (IMPLEMENTATION_PLAN.md
  -- Day 6) — modeled as data, not assumed in code, so a second bank/account
  -- is just another row.
  bank_name text not null,
  account_name text not null,
  account_number_masked text not null,
  currency text not null default 'IDR',
  business_unit_id uuid references business_units(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_name, account_number_masked)
);

create trigger bank_accounts_set_updated_at
  before update on bank_accounts
  for each row execute function set_updated_at();

create table bank_imports (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_accounts(id),
  import_id uuid not null references imports(id),
  statement_period_start date not null,
  statement_period_end date not null,
  imported_at timestamptz not null default now()
);

create index bank_imports_account_idx on bank_imports (bank_account_id, statement_period_start);

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_accounts(id),
  transaction_date date not null,
  value_date date,
  -- Raw statement text — for BCA, confirmed to carry real matching signal
  -- (e.g. "BOOKING COM"/"TRIP COM"/tiket.com's "tiketcom..." literally
  -- appearing in the description of real sample transactions).
  description text not null,
  -- `[NEW — this revision]` The confirmed real BCA export has no separate
  -- reference/sequence column at all (DATA_MODEL.md §6's "strongest
  -- available match signal when present" is, for BCA specifically,
  -- embedded inline within `description`, never a distinct field) — kept
  -- nullable/unused for BCA, present for a future bank source that does
  -- provide one.
  reference text,
  debit numeric,
  credit numeric,
  -- Signed, derived from debit/credit at insert time.
  amount numeric not null,
  running_balance numeric,
  source_import_id uuid not null references imports(id),
  reconciliation_status bank_transaction_status_enum not null default 'UNMATCHED',
  external_line_ref text,
  -- `[NEW — this revision]` The confirmed real BCA export also has no
  -- external_line_ref, so dedupe_hash is the only idempotency key in
  -- practice — strengthened beyond DATA_MODEL.md §6's literal
  -- (bank_account_id, transaction_date, amount, description, reference)
  -- formula by also folding in running_balance, since BCA's own running
  -- balance is a stable historical fact of a given transaction (re-
  -- uploading the same statement recomputes the same hash) and disambiguates
  -- two same-day, same-amount, same-description transactions (e.g. two
  -- identical admin-fee lines) that would otherwise collide — the same
  -- kind of engineering-judgment hash strengthening already applied to
  -- OTA settlement lines (src/lib/settlement/commit.ts) for an analogous
  -- real-data collision risk.
  dedupe_hash text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency (mandatory, DATA_MODEL.md §6): unique on
-- (bank_account_id, external_line_ref) when available, else
-- (bank_account_id, dedupe_hash). Re-importing a statement period must
-- never create duplicate transactions.
create unique index bank_transactions_ref_unique
  on bank_transactions (bank_account_id, external_line_ref) where external_line_ref is not null;
create unique index bank_transactions_hash_unique
  on bank_transactions (bank_account_id, dedupe_hash) where external_line_ref is null;
create index bank_transactions_account_date_idx on bank_transactions (bank_account_id, transaction_date);
create index bank_transactions_status_idx on bank_transactions (reconciliation_status);

create trigger bank_transactions_set_updated_at
  before update on bank_transactions
  for each row execute function set_updated_at();

create table settlement_bank_allocations (
  id uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null references bank_transactions(id) on delete cascade,
  settlement_batch_id uuid references ota_settlement_batches(id),
  settlement_line_id uuid references ota_settlement_lines(id),
  allocated_amount numeric not null,
  -- Matching signal priority, confirmed (REPORTING_LOGIC.md §11): reference
  -- (if available) -> exact amount -> channel + date proximity + amount
  -- tolerance -> description/text. BCA has no reference column in
  -- practice, so REFERENCE_MATCH is modeled but not expected to fire until
  -- a bank source that provides one is added.
  match_method bank_match_method_enum not null,
  match_confidence numeric,
  -- Required for anything short of an unambiguous exact-reference-and-amount
  -- match — never silently auto-committed (enforced at the application
  -- layer, same precedent as settlement_reservation_allocations).
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bank_transaction_id, settlement_batch_id, settlement_line_id)
);

create index settlement_bank_allocations_transaction_idx on settlement_bank_allocations (bank_transaction_id);
create index settlement_bank_allocations_batch_idx on settlement_bank_allocations (settlement_batch_id);

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'bank_accounts', 'bank_imports', 'bank_transactions', 'settlement_bank_allocations'
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
