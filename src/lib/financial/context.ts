import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelPaymentRuleRow, TaxProfileAssignmentRow, TaxProfileRow } from "./types";

export interface AllocationContext {
  rules: ChannelPaymentRuleRow[];
  assignments: TaxProfileAssignmentRow[];
  profiles: TaxProfileRow[];
  villaGroupByVilla: Map<string, string | null>;
}

/**
 * The villa_group/channel_payment_rules/villa_tax_profile_assignments/
 * villa_tax_profiles fetch every allocateReservationNights() caller needs
 * (FINANCIAL_LOGIC.md §7a) — factored out once it was needed by a third
 * page (Monthly Performance, Road to Target) beyond All Bookings, so the
 * lookup stays identical everywhere rather than re-typed per page.
 */
export async function loadAllocationContext(
  supabase: SupabaseClient,
  villaIds: string[],
  channelIds: string[],
): Promise<AllocationContext> {
  const [{ data: villaRows }, { data: rules }, { data: assignments }, { data: profiles }] = await Promise.all([
    villaIds.length
      ? supabase.from("villas").select("id, villa_group_id").in("id", villaIds)
      : Promise.resolve({ data: [] }),
    channelIds.length
      ? supabase.from("channel_payment_rules").select("*").in("channel_id", channelIds)
      : Promise.resolve({ data: [] }),
    villaIds.length
      ? supabase.from("villa_tax_profile_assignments").select("*").in("villa_id", villaIds)
      : Promise.resolve({ data: [] }),
    supabase.from("villa_tax_profiles").select("*"),
  ]);

  return {
    rules: (rules ?? []) as ChannelPaymentRuleRow[],
    assignments: (assignments ?? []) as TaxProfileAssignmentRow[],
    profiles: (profiles ?? []) as TaxProfileRow[],
    villaGroupByVilla: new Map((villaRows ?? []).map((v) => [v.id as string, v.villa_group_id as string | null])),
  };
}
