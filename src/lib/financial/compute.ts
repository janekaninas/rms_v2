import type { ChannelPaymentRuleRow, NightlyComputation, TaxProfileRow } from "./types";

/**
 * The confirmed Gross→Commission→VAT→PB1→Net calculation (FINANCIAL_LOGIC.md
 * §1-§6, §11), for one reservation's one stay-night.
 *
 * `daily_revenue.commission` stores commission + payment_service_fee
 * combined — DATA_MODEL.md's derived formula (`net_revenue =
 * commercial_revenue_basis_amount − commission − commission_vat − pb1`)
 * only has room for one combined deduction term, and channel_payment_rules
 * already keeps the two rates separately configured/drillable at the
 * config level (FINANCIAL_LOGIC.md §2's stated reason for splitting
 * them), so nothing is lost by combining them here for the ledger. Flag
 * if a separately-stored fee line is actually wanted.
 *
 * `service_charge_extraction` is its own column (added in Day 3,
 * confirmed against a real ROOM REV row) rather than folded into
 * commission, since it's a villa-tax-profile deduction, not a channel
 * deduction — collapsing them would misrepresent an OTA's actual
 * commission line when drilling down.
 */
export function computeNightlyRevenue(
  amount: number,
  rule: ChannelPaymentRuleRow,
  taxProfile: TaxProfileRow,
): NightlyComputation {
  const isGross = rule.source_amount_basis === "GROSS_BEFORE_OTA_DEDUCTIONS";

  const commissionAmount = isGross ? amount * (rule.commission_rate ?? 0) : 0;
  const feeAmount = isGross ? amount * (rule.payment_service_fee_rate ?? 0) : 0;
  const commission = commissionAmount + feeAmount;
  const commissionVat = isGross ? commission * rule.commission_vat_rate : 0;

  // FINANCIAL_LOGIC.md §3: retired Bracha legacy profile only — the
  // amount embedded in a tax-inclusive total: amount - amount/(1+pct).
  const extractionPct = taxProfile.service_charge_extraction_pct;
  const serviceChargeExtraction = extractionPct ? amount - amount / (1 + extractionPct) : 0;

  // FINANCIAL_LOGIC.md §3: PB1 = Commercial_Revenue_Basis / 1.1 × 10%,
  // confirmed never withheld by any OTA (never reduces Expected
  // Settlement) — zero only under the retired Bracha exemption.
  const pb1 = taxProfile.pb1_applicable ? (amount / 1.1) * 0.1 : 0;

  const netRevenue = amount - commission - commissionVat - serviceChargeExtraction - pb1;

  // FINANCIAL_LOGIC.md §5: Expected Settlement is a function of
  // payment_model alone — PB1 and the service-charge extraction never
  // reduce it, regardless of payment model.
  const expectedSettlementContribution =
    rule.payment_model === "NET_REMITTANCE"
      ? isGross
        ? amount - commission - commissionVat
        : amount
      : amount; // GROSS_REMITTANCE_INVOICE_LATER

  return {
    commission,
    commissionVat,
    serviceChargeExtraction,
    pb1,
    netRevenue,
    expectedSettlementContribution,
    ruleId: rule.id,
  };
}
