-- Day 6 follow-up: the confirmed real BCA operating account, seeded from
-- three real BCA "Mutasi Rekening" statement samples (all three periods
-- show the identical account: no. rekening 038-3034741, atas nama BRACHA
-- MITRA PERKASA PT). CLAUDE.md rule 8: bank accounts are configuration,
-- never hardcoded in application code — this is the master-data row every
-- Bank Mutation Upload/Bank Reconciliation query resolves against, not a
-- literal string anywhere in the app.
--
-- One of the three samples also contained a second account section (a
-- BCA statement covering account 7700908890 / I MADE EVA JANUART, a
-- personal-looking account bundled into the same combined statement
-- export) — deliberately NOT seeded here. Whether that account belongs in
-- this platform at all is a business question for Jane, not something to
-- assume; the import parser (src/lib/import/resolve-bank-mutation.ts)
-- surfaces any statement section with no matching bank_accounts row as a
-- clearly-flagged skip rather than silently importing or silently
-- dropping it.
insert into bank_accounts (bank_name, account_name, account_number_masked, currency, notes)
values (
  'BCA',
  'BRACHA MITRA PERKASA PT',
  '038-3034741',
  'IDR',
  'Confirmed real operating account — seeded from Jane''s real BCA statement samples (Aug-Sep 2026).'
);
