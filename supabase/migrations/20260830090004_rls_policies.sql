-- Day 1: RLS. Single-operator internal tool (CLAUDE.md / PRODUCT_SPEC.md §8) —
-- any authenticated user has full access; anonymous access is denied
-- everywhere. Revisit if/when the platform grows beyond one operator.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'business_units', 'villa_groups', 'owners', 'villas', 'villa_group_members',
      'villa_tax_profiles', 'villa_tax_profile_assignments', 'channels',
      'channel_payment_rules', 'room_villa_mapping', 'revenue_targets',
      'app_settings', 'imports', 'import_row_errors', 'reservations',
      'reservation_status_history', 'daily_revenue', 'revenue_overrides',
      'reconciliation_exceptions'
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
