-- Seeds the confirmed real settlement-mapping presets this session
-- configured and verified against real OTA export samples (Booking.com,
-- Airbnb, Agoda, Tiket.com, Trip.com) — these were created via the
-- Settlement Upload UI against local dev only; this migration is what
-- actually makes them available in every environment, including
-- production, so Jane never has to re-map a format Claude Code already
-- confirmed. Looked up by channel raw_name, not a hardcoded UUID, so
-- this runs correctly regardless of an environment's own seeded IDs.
-- Idempotent: re-running updates rather than duplicates.

do $$
declare
  cid uuid;
begin
  select id into cid from channels where raw_name = 'AGODA';
  if cid is not null then
    insert into ota_settlement_import_configs (channel_id, preset_name, column_mapping)
    values (cid, 'Default', '{"mode": "FLAT", "amount": "To property", "batchDate": "Check-out date", "dateFormat": "YYYY-MM-DD", "description": "Guest name", "batchReference": "Reference number", "batchDateOffsetDays": 30, "reservationReference": "Reference number"}'::jsonb)
    on conflict (channel_id, preset_name) do update set column_mapping = excluded.column_mapping;
  end if;

  select id into cid from channels where raw_name = 'AIRBNB';
  if cid is not null then
    insert into ota_settlement_import_configs (channel_id, preset_name, column_mapping)
    values (cid, 'English', '{"mode": "HIERARCHICAL", "dateFormat": "MM/DD/YYYY", "hierarchical": {"payout": {"batchDateColumn": "Date", "batchTotalColumn": "Paid out", "descriptionColumn": "Details", "batchReferenceColumn": "Reference code"}, "typeColumn": "Type", "reservation": {"extraFields": [{"label": "Service fee", "column": "Service fee"}, {"label": "Gross earnings", "column": "Gross earnings"}, {"label": "Booking date", "column": "Booking date"}, {"label": "Start date", "column": "Start date"}, {"label": "End date", "column": "End date"}, {"label": "Nights", "column": "Nights"}, {"label": "Listing", "column": "Listing"}], "amountColumn": "Amount", "descriptionColumn": "Guest", "description2Column": "Listing", "externalLineRefColumn": "Confirmation code", "reservationReferenceColumn": "Confirmation code"}, "payoutTypeValue": "Payout", "reservationTypeValue": "Reservation"}}'::jsonb)
    on conflict (channel_id, preset_name) do update set column_mapping = excluded.column_mapping;
  end if;

  select id into cid from channels where raw_name = 'AIRBNB';
  if cid is not null then
    insert into ota_settlement_import_configs (channel_id, preset_name, column_mapping)
    values (cid, 'Indonesian', '{"mode": "HIERARCHICAL", "dateFormat": "MM/DD/YYYY", "hierarchical": {"payout": {"batchDateColumn": "Tanggal", "batchTotalColumn": "Sudah dibayarkan", "descriptionColumn": "Detail", "batchReferenceColumn": "Kode referensi"}, "typeColumn": "Tipe", "reservation": {"extraFields": [{"label": "Service fee", "column": "Biaya layanan"}, {"label": "Gross earnings", "column": "Pendapatan kotor"}, {"label": "Booking date", "column": "Tanggal pemesanan"}, {"label": "Start date", "column": "Tanggal mulai"}, {"label": "End date", "column": "Tanggal selesai"}, {"label": "Nights", "column": "Malam"}, {"label": "Listing", "column": "Listing"}], "amountColumn": "Nominal", "descriptionColumn": "Tamu", "description2Column": "Listing", "externalLineRefColumn": "Kode Konfirmasi", "reservationReferenceColumn": "Kode Konfirmasi"}, "payoutTypeValue": "Payout", "reservationTypeValue": "Reservasi"}}'::jsonb)
    on conflict (channel_id, preset_name) do update set column_mapping = excluded.column_mapping;
  end if;

  select id into cid from channels where raw_name = 'BOOKING.COM';
  if cid is not null then
    insert into ota_settlement_import_configs (channel_id, preset_name, column_mapping)
    values (cid, '1 Sept 2026 style', '{"mode": "FLAT", "amount": "Net", "batchDate": "Payout date", "dateFormat": "D_MMM_YYYY", "description": "Guest name", "extraFields": [{"label": "Commission", "column": "Commission"}, {"label": "VAT for online platform services", "column": "VAT for online platform services"}, {"label": "Payments Service Fee", "column": "Payments Service Fee"}, {"label": "Payment status", "column": "Payment status"}, {"label": "Reservation status", "column": "Reservation status"}], "batchReference": "Payout ID", "reservationReference": "Booking number"}'::jsonb)
    on conflict (channel_id, preset_name) do update set column_mapping = excluded.column_mapping;
  end if;

  select id into cid from channels where raw_name = 'BOOKING.COM';
  if cid is not null then
    insert into ota_settlement_import_configs (channel_id, preset_name, column_mapping)
    values (cid, 'Sep 1, 2026 style', '{"mode": "FLAT", "amount": "Net", "batchDate": "Payout date", "dateFormat": "MMM_D_YYYY", "description": "Guest name", "extraFields": [{"label": "Commission", "column": "Commission"}, {"label": "VAT for online platform services", "column": "VAT for online platform services"}, {"label": "Payments Service Fee", "column": "Payments Service Fee"}, {"label": "Payment status", "column": "Payment status"}, {"label": "Reservation status", "column": "Reservation status"}], "batchReference": "Payout ID", "reservationReference": "Booking number"}'::jsonb)
    on conflict (channel_id, preset_name) do update set column_mapping = excluded.column_mapping;
  end if;

  select id into cid from channels where raw_name = 'TIKET.COM';
  if cid is not null then
    insert into ota_settlement_import_configs (channel_id, preset_name, column_mapping)
    values (cid, 'Default', '{"mode": "FLAT", "amount": "Total Price", "batchDate": "Payment Date", "dateFormat": "YYYY-MM-DD", "description": "Room and Rate Plan", "batchReference": "Payment Date", "externalLineRef": "Itinerary ID", "reservationReference": "Itinerary ID"}'::jsonb)
    on conflict (channel_id, preset_name) do update set column_mapping = excluded.column_mapping;
  end if;

  select id into cid from channels where raw_name = 'TRIP.COM';
  if cid is not null then
    insert into ota_settlement_import_configs (channel_id, preset_name, column_mapping)
    values (cid, 'Default', '{"mode": "FLAT", "amount": "Settlement amount", "dateFormat": "YYYY-MM-DD", "headerRowContains": "Reservation no.", "reservationReference": "Reservation no."}'::jsonb)
    on conflict (channel_id, preset_name) do update set column_mapping = excluded.column_mapping;
  end if;

end;
$$;
