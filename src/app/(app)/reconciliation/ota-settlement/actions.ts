"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettlementBatchDetail, type SettlementBatchDetail } from "@/lib/settlement/reconciliation";
import { reresolveUnmatchedSettlementLines } from "@/lib/settlement/reresolve";

export async function getBatchDrilldown(batchId: string): Promise<SettlementBatchDetail | null> {
  const supabase = await createClient();
  return loadSettlementBatchDetail(supabase, batchId);
}

/**
 * Manual "re-check now" sweep — mainly a backfill for settlement lines
 * that were already stuck UNMATCHED before a reservation's voucher_number
 * existed or was captured. New commits already re-check this on their
 * own (src/lib/import/commit.ts, src/lib/settlement/commit.ts).
 */
export async function reresolveUnmatchedLinesAction(): Promise<{ resolvedCount: number }> {
  const supabase = await createClient();
  const result = await reresolveUnmatchedSettlementLines(supabase);
  revalidatePath("/reconciliation/ota-settlement");
  revalidatePath("/reconciliation/bank");
  return result;
}
