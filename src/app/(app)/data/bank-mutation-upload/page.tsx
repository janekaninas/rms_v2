import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/unwrap";
import { PageHeader } from "@/components/page-header";
import type { BankAccount } from "@/lib/types";
import { BankMutationUploadForm } from "./bank-mutation-upload-form";

export default async function BankMutationUploadPage() {
  const supabase = await createClient();
  const bankAccounts = await supabase
    .from("bank_accounts")
    .select("*")
    .order("bank_name")
    .then(unwrap<BankAccount[]>);

  return (
    <div>
      <PageHeader eyebrow="Data" title="Bank Mutation Upload" />
      <BankMutationUploadForm bankAccounts={bankAccounts ?? []} />
    </div>
  );
}
