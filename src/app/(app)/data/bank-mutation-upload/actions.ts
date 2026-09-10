"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBcaMutationDocx } from "@/lib/import/bank-mutation-docx";
import { resolveBankMutationImport } from "@/lib/import/resolve-bank-mutation";
import { commitBankMutationImport } from "@/lib/bank/commit";
import type { BankMutationImportPreview } from "@/lib/import/resolve-bank-mutation";

function revalidateBank() {
  revalidatePath("/data/import-history");
  revalidatePath("/reconciliation/bank");
}

export async function previewBankMutationAction(formData: FormData): Promise<BankMutationImportPreview> {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided.");
  const buffer = await file.arrayBuffer();
  const sections = await parseBcaMutationDocx(buffer);

  const supabase = await createClient();
  return resolveBankMutationImport(supabase, sections, file.name);
}

export async function commitBankMutationAction(
  fileName: string,
  preview: BankMutationImportPreview,
): Promise<import("@/lib/bank/commit").BankMutationCommitResult> {
  const supabase = await createClient();
  const result = await commitBankMutationImport(supabase, fileName, preview);
  revalidateBank();
  return result;
}
