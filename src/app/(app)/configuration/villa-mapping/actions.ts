"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reresolveVillaMappings, type ReresolveVillasResult } from "@/lib/import/reresolve-villas";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v === null || v === "") return null;
  return String(v);
}

// Every downstream view that could show a reservation whose villa just
// changed — DATA_MODEL.md §1 / IMPORT_LOGIC.md §6: a mapping change must
// refresh derived reports immediately, not only after a fresh import.
const DOWNSTREAM_PATHS = [
  "/configuration/villa-mapping",
  "/commercial/all-bookings",
  "/commercial/monthly-performance",
  "/commercial/summary",
  "/commercial/road-to-target",
];

function revalidateDownstream() {
  for (const path of DOWNSTREAM_PATHS) revalidatePath(path);
}

export async function createMapping(formData: FormData): Promise<ReresolveVillasResult> {
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

  if (error) {
    // The (portfolio, match_type, raw_value) unique constraint is the
    // "prevent duplicate/conflicting mappings" guard — surface it as a
    // clear message rather than a raw Postgres constraint-violation string.
    if (error.code === "23505") {
      throw new Error(
        "A mapping for this portfolio + match type + raw value already exists. Edit that mapping instead of adding a duplicate.",
      );
    }
    throw new Error(error.message);
  }

  const result = await reresolveVillaMappings(supabase);
  revalidateDownstream();
  return result;
}

export async function updateMapping(id: string, formData: FormData): Promise<ReresolveVillasResult> {
  const supabase = await createClient();

  const portfolio = str(formData, "portfolio");
  const matchType = str(formData, "match_type");
  const rawValue = str(formData, "raw_value");
  const villaId = str(formData, "villa_id");

  if (!portfolio || !matchType || !rawValue || !villaId) {
    throw new Error("Portfolio, match type, raw value, and villa are all required.");
  }

  const { error } = await supabase
    .from("room_villa_mapping")
    .update({
      portfolio,
      match_type: matchType,
      raw_value: rawValue,
      villa_id: villaId,
      priority: Number(str(formData, "priority") ?? "0"),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Another mapping already uses this portfolio + match type + raw value combination.");
    }
    throw new Error(error.message);
  }

  const result = await reresolveVillaMappings(supabase);
  revalidateDownstream();
  return result;
}

export async function deleteMapping(id: string): Promise<ReresolveVillasResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("room_villa_mapping").delete().eq("id", id);
  if (error) throw new Error(error.message);

  const result = await reresolveVillaMappings(supabase);
  revalidateDownstream();
  return result;
}
