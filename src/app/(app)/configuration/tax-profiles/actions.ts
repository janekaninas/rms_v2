"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v === null || v === "") return null;
  return String(v);
}

export async function createAssignment(formData: FormData) {
  const supabase = await createClient();

  const villaId = str(formData, "villa_id");
  const taxProfileId = str(formData, "tax_profile_id");
  const effectiveFrom = str(formData, "effective_from");

  if (!villaId || !taxProfileId || !effectiveFrom) {
    throw new Error("Villa, tax profile, and effective-from date are required.");
  }

  const { error } = await supabase.from("villa_tax_profile_assignments").insert({
    villa_id: villaId,
    tax_profile_id: taxProfileId,
    effective_from: effectiveFrom,
    effective_to: str(formData, "effective_to"),
    notes: str(formData, "notes"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/configuration/tax-profiles");
}
