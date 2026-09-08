-- Settlement Upload follow-up: a channel can need more than one saved
-- mapping (e.g. Airbnb exports in either English or Indonesian depending
-- on account language settings; Booking.com's own exports have been seen
-- using two different date conventions) — confirmed by Jane. Replaces the
-- one-row-per-channel design with named presets per channel.

alter table ota_settlement_import_configs drop constraint ota_settlement_import_configs_channel_id_key;
alter table ota_settlement_import_configs add column preset_name text not null default 'Default';
alter table ota_settlement_import_configs add constraint ota_settlement_import_configs_channel_preset_unique
  unique (channel_id, preset_name);
