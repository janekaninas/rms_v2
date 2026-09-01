"use server";

import { createClient } from "@/lib/supabase/server";
import { loadSettlementBatchDetail, type SettlementBatchDetail } from "@/lib/settlement/reconciliation";

export async function getBatchDrilldown(batchId: string): Promise<SettlementBatchDetail | null> {
  const supabase = await createClient();
  return loadSettlementBatchDetail(supabase, batchId);
}
