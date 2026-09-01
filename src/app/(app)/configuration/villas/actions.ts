"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  BRACHA_CUTOVER_DATE,
  BRACHA_GROUP_NAME,
  BRACHA_LEGACY_PROFILE_NAME,
  STANDARD_TAX_PROFILE_NAME,
} from "@/lib/types";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v === null || v === "") return null;
  return String(v);
}

// Applies the confirmed Bracha cutover rule (CLAUDE.md rule 19,
// FINANCIAL_LOGIC.md §3) to a newly created villa. The 2026-08-01 cutover
// only bounds Bracha's legacy→standard transition — every other villa was
// always on standard treatment with no cutover, so its `standard`
// assignment starts from the villa's own management_start_date, not the
// cutover date (a Day-3 fix: the original version of this function gave
// every villa a gap before 2026-08-01, since it applied the cutover date
// as if it were universal).
async function applyConfirmedTaxProfileAssignments(
  villaId: string,
  villaGroupId: string | null,
  managementStartDate: string,
) {
  const supabase = await createClient();

  const { data: standardProfile } = await supabase
    .from("villa_tax_profiles")
    .select("id")
    .eq("name", STANDARD_TAX_PROFILE_NAME)
    .single();

  const { data: braGroup } = await supabase
    .from("villa_groups")
    .select("id")
    .eq("name", BRACHA_GROUP_NAME)
    .single();

  const isBracha = Boolean(braGroup && villaGroupId && braGroup.id === villaGroupId);

  if (standardProfile) {
    await supabase.from("villa_tax_profile_assignments").insert({
      villa_id: villaId,
      tax_profile_id: standardProfile.id,
      effective_from: isBracha ? BRACHA_CUTOVER_DATE : managementStartDate,
      effective_to: null,
      notes: isBracha
        ? "Auto-assigned on villa creation per the confirmed 2026-08-01 cutover rule."
        : "Auto-assigned on villa creation — standard treatment applies from when the villa came under management (no cutover applies outside Bracha).",
    });
  }

  if (isBracha && managementStartDate < BRACHA_CUTOVER_DATE) {
    const { data: legacyProfile } = await supabase
      .from("villa_tax_profiles")
      .select("id")
      .eq("name", BRACHA_LEGACY_PROFILE_NAME)
      .single();

    if (legacyProfile) {
      await supabase.from("villa_tax_profile_assignments").insert({
        villa_id: villaId,
        tax_profile_id: legacyProfile.id,
        effective_from: managementStartDate,
        effective_to: "2026-07-31",
        notes: "Auto-assigned on villa creation: retired Bracha legacy profile for stay dates before the confirmed cutover.",
      });
    }
  }
}

export async function createVilla(formData: FormData) {
  const supabase = await createClient();

  const villaCode = str(formData, "villa_code");
  const name = str(formData, "name");
  const portfolio = str(formData, "portfolio");
  const managementStartDate = str(formData, "management_start_date");

  if (!villaCode || !name || !portfolio || !managementStartDate) {
    throw new Error("Villa code, name, portfolio, and management start date are required.");
  }

  const villaGroupId = str(formData, "villa_group_id");

  const { data, error } = await supabase
    .from("villas")
    .insert({
      villa_code: villaCode,
      name,
      portfolio,
      unit_count: Number(str(formData, "unit_count") ?? "1"),
      owner_id: str(formData, "owner_id"),
      management_start_date: managementStartDate,
      management_end_date: str(formData, "management_end_date"),
      business_unit_id: null,
      villa_group_id: villaGroupId,
      active: formData.get("active") === "on",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await applyConfirmedTaxProfileAssignments(data.id, villaGroupId, managementStartDate);

  revalidatePath("/configuration/villas");
}

// CLAUDE.md rule 8: `active` is a current-config filter only, never a
// historical-reporting one — toggling it never changes villa_id
// resolution or any stored figure, only which villas current-config
// surfaces (dropdowns, this page's default list) offer going forward.
// Still worth a dedicated one-click action rather than only the buried
// Switch inside the full Edit form.
export async function toggleVillaActive(villaId: string, nextActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("villas").update({ active: nextActive }).eq("id", villaId);
  if (error) throw new Error(error.message);

  revalidatePath("/configuration/villas");
  revalidatePath("/configuration/villa-mapping");
  revalidatePath("/configuration/channel-payment-rules");
  revalidatePath("/configuration/revenue-targets");
}

// CLAUDE.md rule 15 / DATA_MODEL.md §1: never hard-delete a villa that
// real ledger or config data depends on — deactivate instead, so
// historical reporting is preserved. A villa is only actually removable
// when nothing references it yet (e.g. created by mistake, never used).
export async function deleteVillaIfSafe(villaId: string) {
  const supabase = await createClient();

  const [reservations, dailyRevenue, mappings, paymentRules, targets] = await Promise.all([
    supabase.from("reservations").select("id", { count: "exact", head: true }).eq("villa_id", villaId),
    supabase.from("daily_revenue").select("id", { count: "exact", head: true }).eq("villa_id", villaId),
    supabase.from("room_villa_mapping").select("id", { count: "exact", head: true }).eq("villa_id", villaId),
    supabase.from("channel_payment_rules").select("id", { count: "exact", head: true }).eq("villa_id", villaId),
    supabase.from("revenue_targets").select("id", { count: "exact", head: true }).eq("villa_id", villaId),
  ]);

  const blockers: string[] = [];
  if ((reservations.count ?? 0) > 0) blockers.push(`${reservations.count} reservation(s)`);
  if ((dailyRevenue.count ?? 0) > 0) blockers.push(`${dailyRevenue.count} daily revenue row(s)`);
  if ((mappings.count ?? 0) > 0) blockers.push(`${mappings.count} room mapping(s)`);
  if ((paymentRules.count ?? 0) > 0) blockers.push(`${paymentRules.count} channel payment rule(s)`);
  if ((targets.count ?? 0) > 0) blockers.push(`${targets.count} revenue target(s)`);

  if (blockers.length > 0) {
    throw new Error(
      `Cannot remove this villa — it's referenced by ${blockers.join(", ")}. Deactivate it instead to preserve historical reporting.`,
    );
  }

  const { error } = await supabase.from("villas").delete().eq("id", villaId);
  if (error) throw new Error(error.message);
  revalidatePath("/configuration/villas");
}

export async function updateVilla(villaId: string, formData: FormData) {
  const supabase = await createClient();

  const name = str(formData, "name");
  const portfolio = str(formData, "portfolio");
  const managementStartDate = str(formData, "management_start_date");

  if (!name || !portfolio || !managementStartDate) {
    throw new Error("Name, portfolio, and management start date are required.");
  }

  // villa_code is intentionally never accepted from this form — it is
  // write-once (CLAUDE.md rule 8) and is also protected at the database
  // layer by a trigger, so omitting it here is defense in depth, not the
  // only safeguard.
  const { error } = await supabase
    .from("villas")
    .update({
      name,
      portfolio,
      unit_count: Number(str(formData, "unit_count") ?? "1"),
      owner_id: str(formData, "owner_id"),
      management_start_date: managementStartDate,
      management_end_date: str(formData, "management_end_date"),
      villa_group_id: str(formData, "villa_group_id"),
      active: formData.get("active") === "on",
    })
    .eq("id", villaId);

  if (error) throw new Error(error.message);

  revalidatePath("/configuration/villas");
}
