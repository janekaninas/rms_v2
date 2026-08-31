import type { ChannelPaymentRuleRow, TaxProfileAssignmentRow, TaxProfileRow } from "./types";

/**
 * DATA_MODEL.md §4: the most specific matching, currently-effective row
 * wins — villa-specific > villa-group > channel-wide default. `priority`
 * only breaks ties within the same specificity level. Returns null (never
 * a guessed default) when nothing resolves — the caller must raise
 * MISSING_PAYMENT_RULE (CLAUDE.md rule 20).
 */
export function resolveChannelPaymentRule(
  rules: ChannelPaymentRuleRow[],
  channelId: string,
  villaId: string | null,
  villaGroupId: string | null,
  date: string,
): ChannelPaymentRuleRow | null {
  const effective = rules.filter(
    (r) =>
      r.channel_id === channelId &&
      r.effective_from <= date &&
      (r.effective_to === null || r.effective_to >= date),
  );

  const byPriority = (rows: ChannelPaymentRuleRow[]) =>
    rows.length ? rows.slice().sort((a, b) => b.priority - a.priority)[0] : null;

  if (villaId) {
    const villaMatch = byPriority(effective.filter((r) => r.villa_id === villaId));
    if (villaMatch) return villaMatch;
  }
  if (villaGroupId) {
    const groupMatch = byPriority(effective.filter((r) => r.villa_group_id === villaGroupId));
    if (groupMatch) return groupMatch;
  }
  return byPriority(effective.filter((r) => r.villa_id === null && r.villa_group_id === null));
}

/**
 * DATA_MODEL.md §1: the applicable profile for a villa/date is the row
 * whose [effective_from, effective_to] (inclusive) contains that date.
 */
export function resolveTaxProfile(
  assignments: TaxProfileAssignmentRow[],
  profiles: TaxProfileRow[],
  villaId: string,
  date: string,
): TaxProfileRow | null {
  const match = assignments.find(
    (a) =>
      a.villa_id === villaId &&
      a.effective_from <= date &&
      (a.effective_to === null || a.effective_to >= date),
  );
  if (!match) return null;
  return profiles.find((p) => p.id === match.tax_profile_id) ?? null;
}
