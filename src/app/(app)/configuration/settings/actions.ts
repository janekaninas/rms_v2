"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function upsertSetting(formData: FormData) {
  const supabase = await createClient();

  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  const description = String(formData.get("description") ?? "") || null;

  if (!key) throw new Error("Setting key is required.");

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, description }, { onConflict: "key" });

  if (error) throw new Error(error.message);
  revalidatePath("/configuration/settings");
}

export async function deleteSetting(key: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").delete().eq("key", key);
  if (error) throw new Error(error.message);
  revalidatePath("/configuration/settings");
}
