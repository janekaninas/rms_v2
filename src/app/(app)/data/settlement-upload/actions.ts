"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseSettlementFile } from "@/lib/import/settlement-csv";
import { resolveSettlementImport } from "@/lib/import/resolve-settlement";
import { commitSettlementBatches } from "@/lib/settlement/commit";
import type { SettlementColumnMapping } from "@/lib/types";
import type { SettlementImportPreview, SettlementBatchDraft } from "@/lib/import/settlement-types";

function revalidateSettlement() {
  revalidatePath("/data/import-history");
  revalidatePath("/reconciliation/ota-settlement");
}

export async function inspectSettlementFileAction(
  formData: FormData,
): Promise<{ headers: string[]; sampleRows: Record<string, string>[] }> {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided.");
  const text = await file.text();
  const table = parseSettlementFile(text);
  if (table.headers.length === 0) {
    throw new Error("Could not find a header row in this file. Confirm it's a CSV with a header row.");
  }
  return { headers: table.headers, sampleRows: table.rows.slice(0, 5) };
}

export async function getSavedMappingAction(channelId: string): Promise<SettlementColumnMapping | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ota_settlement_import_configs")
    .select("column_mapping")
    .eq("channel_id", channelId)
    .maybeSingle();
  return (data?.column_mapping as SettlementColumnMapping | undefined) ?? null;
}

export async function saveMappingAction(channelId: string, mapping: SettlementColumnMapping): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ota_settlement_import_configs")
    .upsert({ channel_id: channelId, column_mapping: mapping }, { onConflict: "channel_id" });
  if (error) throw new Error(error.message);
}

export async function previewSettlementAction(
  channelId: string,
  mapping: SettlementColumnMapping,
  formData: FormData,
): Promise<SettlementImportPreview> {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided.");
  const text = await file.text();
  const table = parseSettlementFile(text);

  const supabase = await createClient();
  return resolveSettlementImport(supabase, channelId, file.name, table, mapping);
}

export async function commitSettlementAction(
  fileName: string,
  preview: SettlementImportPreview,
): Promise<{ batchIds: string[] }> {
  const supabase = await createClient();

  const drafts: SettlementBatchDraft[] = preview.batches
    .filter((b) => b.lines.length > 0)
    .map((b) => ({
      channelId: preview.channelId,
      batchReference: b.batchReference,
      batchDate: b.batchDate,
      declaredNetAmount: b.netAmount,
      lines: b.lines
        .filter((rl) => rl.line.errors.length === 0 && rl.line.amount !== null)
        .map((rl) => ({
          lineType: rl.line.lineType,
          rawReservationReference: rl.line.rawReservationReference,
          amount: rl.line.amount as number,
          description: rl.line.description,
          externalLineRef: rl.line.externalLineRef,
          extraFields: rl.line.extraFields,
        })),
    }));

  const { data: importRow, error: importError } = await supabase
    .from("imports")
    .insert({
      import_type: "OTA_SETTLEMENT",
      filename: fileName,
      row_count: preview.totalRows,
      new_count: preview.counts.matched,
      unmatched_count: preview.counts.unmatched + preview.counts.ambiguous,
      error_count: preview.counts.errors,
      status: "PENDING_REVIEW",
    })
    .select("id")
    .single();
  if (importError) throw new Error(`Failed to record import summary: ${importError.message}`);

  try {
    const result = await commitSettlementBatches(supabase, importRow.id as string, drafts);
    await supabase.from("imports").update({ status: "COMMITTED" }).eq("id", importRow.id);
    revalidateSettlement();
    return result;
  } catch (e) {
    await supabase.from("imports").update({ status: "FAILED" }).eq("id", importRow.id);
    throw e;
  }
}

export async function commitManualEntryAction(draft: SettlementBatchDraft): Promise<{ batchIds: string[] }> {
  const supabase = await createClient();
  const result = await commitSettlementBatches(supabase, null, [draft]);
  revalidateSettlement();
  return result;
}
