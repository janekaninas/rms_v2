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

// Manual upsert rather than a Postgres ON CONFLICT upsert: the uniqueness
// constraints (DATA_MODEL.md §9) are partial indexes — one row per month
// for the portfolio (villa_id IS NULL), one row per villa per month
// otherwise — which PostgREST's upsert helper can't target directly.
export async function upsertTarget(formData: FormData) {
  const supabase = await createClient();

  const villaId = str(formData, "villa_id");
  const year = num(formData, "year");
  const month = num(formData, "month");
  const revenueTarget = num(formData, "revenue_target");

  if (!year || !month || revenueTarget === null) {
    throw new Error("Year, month, and revenue target are required.");
  }

  const payload = {
    villa_id: villaId,
    year,
    month,
    revenue_target: revenueTarget,
    occupancy_target: num(formData, "occupancy_target"),
    arr_target: num(formData, "arr_target"),
    notes: str(formData, "notes"),
  };

  let existingQuery = supabase
    .from("revenue_targets")
    .select("id")
    .eq("year", year)
    .eq("month", month);
  existingQuery = villaId ? existingQuery.eq("villa_id", villaId) : existingQuery.is("villa_id", null);

  const { data: existing } = await existingQuery.maybeSingle();

  const { error } = existing
    ? await supabase.from("revenue_targets").update(payload).eq("id", existing.id)
    : await supabase.from("revenue_targets").insert(payload);

  if (error) throw new Error(error.message);
  revalidatePath("/configuration/revenue-targets");
}
