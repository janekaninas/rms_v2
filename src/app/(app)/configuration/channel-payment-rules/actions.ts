"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v === null || v === "") return null;
  return String(v);
}

function num(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  return v === null ? null : Number(v);
}

export async function createChannel(formData: FormData) {
  const supabase = await createClient();
  const rawName = str(formData, "raw_name");
  const displayName = str(formData, "display_name");
  const channelType = str(formData, "channel_type");

  if (!rawName || !displayName || !channelType) {
    throw new Error("Raw name, display name, and channel type are required.");
  }

  const { error } = await supabase.from("channels").insert({
    raw_name: rawName,
    display_name: displayName,
    channel_type: channelType,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/configuration/channel-payment-rules");
}

export async function createRule(formData: FormData) {
  const supabase = await createClient();

  const channelId = str(formData, "channel_id");
  const scope = str(formData, "scope"); // "default" | "villa" | "villa_group"
  const villaId = scope === "villa" ? str(formData, "villa_id") : null;
  const villaGroupId = scope === "villa_group" ? str(formData, "villa_group_id") : null;
  const sourceAmountBasis = str(formData, "source_amount_basis");
  const paymentModel = str(formData, "payment_model");
  const effectiveFrom = str(formData, "effective_from");

  if (!channelId || !sourceAmountBasis || !paymentModel || !effectiveFrom) {
    throw new Error("Channel, source amount basis, payment model, and effective-from date are required.");
  }
  if (scope === "villa" && !villaId) {
    throw new Error("Select a villa for a villa-specific rule.");
  }
  if (scope === "villa_group" && !villaGroupId) {
    throw new Error("Select a villa group for a group-level rule.");
  }

  const { error } = await supabase.from("channel_payment_rules").insert({
    channel_id: channelId,
    villa_id: villaId,
    villa_group_id: villaGroupId,
    source_amount_basis: sourceAmountBasis,
    payment_model: paymentModel,
    commission_rate: num(formData, "commission_rate"),
    payment_service_fee_rate: num(formData, "payment_service_fee_rate"),
    commission_vat_rate: num(formData, "commission_vat_rate") ?? 0.11,
    // Confirmed: no OTA withholds PB1 for any channel (CLAUDE.md rule 18).
    // Changing this away from false requires the same sign-off as any
    // other financial-logic change, so it is not exposed as a form field.
    pb1_withheld_by_ota: false,
    effective_from: effectiveFrom,
    effective_to: str(formData, "effective_to"),
    priority: num(formData, "priority") ?? 0,
    notes: str(formData, "notes"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/configuration/channel-payment-rules");
}

export async function deleteRule(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("channel_payment_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuration/channel-payment-rules");
}
