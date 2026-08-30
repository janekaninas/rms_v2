"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v === null || v === "") return null;
  return String(v);
}

export async function createOwner(formData: FormData) {
  const supabase = await createClient();
  const name = str(formData, "name");
  if (!name) throw new Error("Owner name is required.");

  const { error } = await supabase.from("owners").insert({
    name,
    contact_email: str(formData, "contact_email"),
    contact_phone: str(formData, "contact_phone"),
    default_bank_account_ref: str(formData, "default_bank_account_ref"),
    notes: str(formData, "notes"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/configuration/owners");
}

export async function updateOwner(ownerId: string, formData: FormData) {
  const supabase = await createClient();
  const name = str(formData, "name");
  if (!name) throw new Error("Owner name is required.");

  const { error } = await supabase
    .from("owners")
    .update({
      name,
      contact_email: str(formData, "contact_email"),
      contact_phone: str(formData, "contact_phone"),
      default_bank_account_ref: str(formData, "default_bank_account_ref"),
      notes: str(formData, "notes"),
    })
    .eq("id", ownerId);

  if (error) throw new Error(error.message);
  revalidatePath("/configuration/owners");
}
