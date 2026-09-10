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

export type SettlementLineType =
  | "BOOKING_PAYOUT"
  | "ADJUSTMENT"
  | "REFUND"
  | "CORRECTION"
  | "FEE"
  | "OTHER";
export type SettlementMatchedStatus = "UNMATCHED" | "MATCHED" | "PARTIALLY_MATCHED";
export type SettlementAllocationMethod = "EXACT_MATCH" | "AMOUNT_MATCH" | "MANUAL";
export type SettlementBatchStatus = "PENDING" | "PARTIALLY_SETTLED" | "SETTLED" | "VARIANCE" | "NEEDS_REVIEW";

export interface OtaSettlementBatch {
  id: string;
  channel_id: string;
  source_import_id: string | null;
  batch_reference: string | null;
  batch_date: string;
  gross_settlement_amount: number;
  adjustment_amount: number;
  net_settlement_amount: number;
  currency: string;
  status: SettlementBatchStatus;
  notes: string | null;
}

export interface OtaSettlementLine {
  id: string;
  batch_id: string;
  line_type: SettlementLineType;
  raw_reservation_reference: string | null;
  description: string | null;
  amount: number;
  matched_status: SettlementMatchedStatus;
  external_line_ref: string | null;
}

export interface SettlementReservationAllocation {
  id: string;
  settlement_line_id: string;
  reservation_id: string;
  allocated_amount: number;
  allocation_method: SettlementAllocationMethod;
}

/**
 * IMPORT_LOGIC.md §8 pt.1: the settlement file column mapping is
 * configuration, per channel — never a hardcoded per-OTA parser. Set once
 * per channel through the Settlement Upload UI after a real file is seen
 * (confirmed against real Booking.com and Airbnb exports — FINANCIAL_LOGIC.md
 * §10 item 19).
 */
export type SettlementFileShape = "FLAT" | "HIERARCHICAL";

/**
 * Real settlement exports use more than one date convention — Booking.com's
 * confirmed samples use both "1 Sept 2026" (day, text month, year) and
 * "Sep 1, 2026" (text month, day, year) across different exports; Airbnb's
 * confirmed sample uses "08/31/2026" (MM/DD/YYYY, not the DD/MM/YYYY VHP
 * exports use). Explicit per-mapping choice, never auto-guessed, since
 * MM/DD and DD/MM are ambiguous for any day <= 12.
 */
export type SettlementDateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY" | "D_MMM_YYYY" | "MMM_D_YYYY";

export interface SettlementExtraFieldMapping {
  /** Shown as-is in the drill-down (e.g. "Commission", "Reservation status"). */
  label: string;
  column: string;
}

/**
 * `[REVISED]` Flat mode (confirmed against the real Booking.com export —
 * every row is one settlement line, rows sharing a batch reference/date
 * group into one batch) is unchanged in shape from the original design.
 * Hierarchical mode is new — confirmed against the real Airbnb export,
 * which interleaves `Type = Payout` summary rows with `Type = Reservation`
 * detail rows; each Reservation row belongs to the nearest preceding
 * Payout row, and the Payout row's own declared total is the batch's
 * authoritative net settlement amount (validated, not replaced, by the
 * sum of its reservation lines).
 */
export interface SettlementColumnMapping {
  mode: SettlementFileShape;
  dateFormat: SettlementDateFormat;

  /**
   * For a file with a preamble before the real header row (e.g. Trip.com's
   * "Prepay statement" title + a "Total prepaid amount ..." line before
   * its actual "Reservation type, Reservation no., ..." header) — text
   * that appears in the real header row, used to locate it. Data rows
   * stop at the first fully-blank row after that (so Trip.com's separate
   * "Campaigns" table below the reservation table is never read as
   * reservation data). Leave unset when the header is the file's first
   * row (every other confirmed channel).
   */
  headerRowContains?: string;

  // FLAT mode — required when mode = "FLAT".
  batchReference?: string;
  batchDate?: string;
  /**
   * Days to add to the parsed `batchDate` (e.g. Agoda: no payout date is
   * exported at all, but Jane confirmed the claimable date is 30 days
   * after the stay — so `batchDate` maps to Check-out date with
   * `batchDateOffsetDays: 30`). Omit/0 for a column that's already the
   * real payout date.
   */
  batchDateOffsetDays?: number;
  lineType?: string;
  reservationReference?: string;
  amount?: string;
  description?: string;
  /** Optional second column, joined to `description` with " — " (e.g. Airbnb's Guest + Listing). */
  description2?: string;
  externalLineRef?: string;
  extraFields?: SettlementExtraFieldMapping[];

  // HIERARCHICAL mode — required when mode = "HIERARCHICAL".
  hierarchical?: {
    typeColumn: string;
    payoutTypeValue: string;
    reservationTypeValue: string;
    payout: {
      batchDateColumn: string;
      batchReferenceColumn: string;
      /** The Payout row's own declared total (e.g. Airbnb's "Paid out") — the batch's authoritative net settlement amount. */
      batchTotalColumn: string;
      descriptionColumn?: string;
    };
    reservation: {
      reservationReferenceColumn: string;
      amountColumn: string;
      descriptionColumn?: string;
      description2Column?: string;
      externalLineRefColumn?: string;
      extraFields?: SettlementExtraFieldMapping[];
    };
  };
}

/**
 * A channel can need more than one saved mapping — confirmed by Jane:
 * Airbnb exports in either English or Indonesian depending on account
 * language settings, and Booking.com's own exports have been seen using
 * two different date conventions. `preset_name` distinguishes them
 * (unique per channel); a channel with only one real format just uses
 * "Default".
 */
export interface OtaSettlementImportConfig {
  id: string;
  channel_id: string;
  preset_name: string;
  column_mapping: SettlementColumnMapping;
  notes: string | null;
}

// Confirmed cutover date for the Bracha legacy → standard tax profile
// transition (CLAUDE.md rule 19, FINANCIAL_LOGIC.md §3). Not a magic
// number invented here — it is the explicitly confirmed business rule.
export const BRACHA_CUTOVER_DATE = "2026-08-01";
export const BRACHA_LEGACY_PROFILE_NAME = "bracha_legacy_21pct";
export const STANDARD_TAX_PROFILE_NAME = "standard";
export const BRACHA_GROUP_NAME = "Bracha";

// ---------------------------------------------------------------------
// Day 6 — Bank Reconciliation (DATA_MODEL.md §6)
// ---------------------------------------------------------------------

export type BankTransactionStatus = "UNMATCHED" | "PARTIALLY_MATCHED" | "MATCHED" | "NEEDS_REVIEW";
export type BankMatchMethod = "EXACT_AMOUNT" | "REFERENCE_MATCH" | "AMOUNT_AND_DATE_PROXIMITY" | "MANUAL";

/**
 * Report-level computed label combining settlement and bank state
 * (REPORTING_LOGIC.md §11) — not a stored column, same multi-dimensional
 * status principle as DATA_MODEL.md §11.
 */
export type BankReconciliationStatus =
  | "AWAITING_SETTLEMENT"
  | "AWAITING_BANK"
  | "MATCHED"
  | "PARTIAL"
  | "VARIANCE"
  | "UNMATCHED"
  | "NEEDS_REVIEW";

export interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number_masked: string;
  currency: string;
  business_unit_id: string | null;
  notes: string | null;
}

export interface BankTransaction {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  value_date: string | null;
  description: string;
  reference: string | null;
  debit: number | null;
  credit: number | null;
  amount: number;
  running_balance: number | null;
  reconciliation_status: BankTransactionStatus;
  external_line_ref: string | null;
  notes: string | null;
}

export interface SettlementBankAllocation {
  id: string;
  bank_transaction_id: string;
  settlement_batch_id: string | null;
  settlement_line_id: string | null;
  allocated_amount: number;
  match_method: BankMatchMethod;
  match_confidence: number | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}
