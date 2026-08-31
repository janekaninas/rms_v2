"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseVhpCsv } from "@/lib/import/csv";
import { mapBookingsRows } from "@/lib/import/map-bookings";
import { mapCancellationsRows } from "@/lib/import/map-cancellations";
import { mapBaselineRows } from "@/lib/import/map-baseline";
import { resolveRows } from "@/lib/import/resolve";
import { commitImport } from "@/lib/import/commit";
import { mapRoomRevenueRows } from "@/lib/import/map-room-revenue";
import { resolveRoomRevenueRows } from "@/lib/import/resolve-room-revenue";
import { commitRoomRevenueImport } from "@/lib/import/commit-room-revenue";
import type { ImportKind, ImportPreview } from "@/lib/import/types";
import type { RoomRevenuePreview } from "@/lib/import/resolve-room-revenue";

const REQUIRED_HEADER_CELL = "Reservation Number";

export async function previewImportAction(
  importKind: ImportKind,
  formData: FormData,
): Promise<ImportPreview> {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided.");

  const text = await file.text();
  const table = parseVhpCsv(text, REQUIRED_HEADER_CELL);

  const normalized =
    importKind === "NEW_BOOKINGS"
      ? mapBookingsRows(table)
      : importKind === "CANCELLATIONS"
        ? mapCancellationsRows(table)
        : mapBaselineRows(table);

  const supabase = await createClient();
  return resolveRows(supabase, importKind, file.name, normalized);
}

export async function commitImportAction(preview: ImportPreview) {
  const supabase = await createClient();
  const result = await commitImport(supabase, preview.importKind, preview.fileName, preview);
  revalidatePath("/data/import-history");
  revalidatePath("/commercial/all-bookings");
  return result;
}

export async function previewRoomRevenueAction(formData: FormData): Promise<RoomRevenuePreview> {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided.");

  const text = await file.text();
  const table = parseVhpCsv(text, REQUIRED_HEADER_CELL);
  const normalized = mapRoomRevenueRows(table);

  const supabase = await createClient();
  return resolveRoomRevenueRows(supabase, file.name, normalized);
}

export async function commitRoomRevenueAction(preview: RoomRevenuePreview) {
  const supabase = await createClient();
  const result = await commitRoomRevenueImport(supabase, preview.fileName, preview);
  revalidatePath("/data/import-history");
  revalidatePath("/commercial/all-bookings");
  return result;
}
