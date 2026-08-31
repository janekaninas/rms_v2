export interface ChannelPaymentRuleRow {
  id: string;
  channel_id: string;
  villa_id: string | null;
  villa_group_id: string | null;
  source_amount_basis: "GROSS_BEFORE_OTA_DEDUCTIONS" | "NET_AFTER_OTA_DEDUCTIONS";
  payment_model: "NET_REMITTANCE" | "GROSS_REMITTANCE_INVOICE_LATER";
  commission_rate: number | null;
  payment_service_fee_rate: number | null;
  commission_vat_rate: number;
  pb1_withheld_by_ota: boolean;
  effective_from: string;
  effective_to: string | null;
  priority: number;
}

export interface TaxProfileRow {
  id: string;
  name: string;
  pb1_applicable: boolean;
  service_charge_extraction_pct: number | null;
}

export interface TaxProfileAssignmentRow {
  villa_id: string;
  tax_profile_id: string;
  effective_from: string;
  effective_to: string | null;
}

export interface NightlyComputation {
  commission: number;
  commissionVat: number;
  serviceChargeExtraction: number;
  pb1: number;
  netRevenue: number;
  expectedSettlementContribution: number;
  ruleId: string;
}

export interface MissingPaymentRule {
  missing: true;
}
