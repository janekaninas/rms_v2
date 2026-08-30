// Hand-written domain types mirroring docs/DATA_MODEL.md for the Day 1
// configuration tables. Kept narrow to what Day 1 pages actually use —
// extend as later days' tables come into play.

export type Portfolio = "AASHA" | "BALINEST";
export type MatchType = "ROOM_NUMBER" | "ROOM_TYPE" | "LISTING";
export type ChannelType = "OTA" | "TRAVEL_AGENT" | "DIRECT";
export type SourceAmountBasis = "GROSS_BEFORE_OTA_DEDUCTIONS" | "NET_AFTER_OTA_DEDUCTIONS";
export type PaymentModel = "NET_REMITTANCE" | "GROSS_REMITTANCE_INVOICE_LATER";

export interface BusinessUnit {
  id: string;
  name: string;
  notes: string | null;
}

export interface VillaGroup {
  id: string;
  name: string;
  notes: string | null;
}

export interface Owner {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  default_bank_account_ref: string | null;
  notes: string | null;
}

export interface Villa {
  id: string;
  villa_code: string;
  name: string;
  portfolio: Portfolio;
  unit_count: number;
  owner_id: string | null;
  active: boolean;
  management_start_date: string;
  management_end_date: string | null;
  business_unit_id: string | null;
  villa_group_id: string | null;
}

export interface VillaTaxProfile {
  id: string;
  name: string;
  pb1_applicable: boolean;
  service_charge_extraction_pct: number | null;
  notes: string | null;
}

export interface VillaTaxProfileAssignment {
  id: string;
  villa_id: string;
  tax_profile_id: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}

export interface Channel {
  id: string;
  raw_name: string;
  display_name: string;
  channel_type: ChannelType;
  active: boolean;
}

export interface ChannelPaymentRule {
  id: string;
  channel_id: string;
  villa_id: string | null;
  villa_group_id: string | null;
  source_amount_basis: SourceAmountBasis;
  payment_model: PaymentModel;
  commission_rate: number | null;
  payment_service_fee_rate: number | null;
  commission_vat_rate: number;
  pb1_withheld_by_ota: boolean;
  effective_from: string;
  effective_to: string | null;
  priority: number;
  notes: string | null;
}

export interface RoomVillaMapping {
  id: string;
  portfolio: Portfolio;
  match_type: MatchType;
  raw_value: string;
  villa_id: string;
  priority: number;
}

export interface RevenueTarget {
  id: string;
  villa_id: string | null;
  year: number;
  month: number;
  revenue_target: number;
  occupancy_target: number | null;
  arr_target: number | null;
  notes: string | null;
}

export interface AppSetting {
  key: string;
  value: unknown;
  description: string | null;
}

// Confirmed cutover date for the Bracha legacy → standard tax profile
// transition (CLAUDE.md rule 19, FINANCIAL_LOGIC.md §3). Not a magic
// number invented here — it is the explicitly confirmed business rule.
export const BRACHA_CUTOVER_DATE = "2026-08-01";
export const BRACHA_LEGACY_PROFILE_NAME = "bracha_legacy_21pct";
export const STANDARD_TAX_PROFILE_NAME = "standard";
export const BRACHA_GROUP_NAME = "Bracha";
