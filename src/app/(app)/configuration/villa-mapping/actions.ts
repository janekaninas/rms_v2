"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v === null || v === "") return null;
  return String(v);
}

export async function createMapping(formData: FormData) {
  const supabase = await createClient();

  const portfolio = str(formData, "portfolio");
  const matchType = str(formData, "match_type");
  const rawValue = str(formData, "raw_value");
  const villaId = str(formData, "villa_id");

  if (!portfolio || !matchType || !rawValue || !villaId) {
    throw new Error("Portfolio, match type, raw value, and villa are all required.");
  }

  const { error } = await supabase.from("room_villa_mapping").insert({
    portfolio,
    match_type: matchType,
    raw_value: rawValue,
    villa_id: villaId,
    priority: Number(str(formData, "priority") ?? "0"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/configuration/villa-mapping");
}

export async function deleteMapping(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("room_villa_mapping").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuration/villa-mapping");
}
