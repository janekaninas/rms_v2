import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/unwrap";
import { PageHeader } from "@/components/page-header";
import type { Channel } from "@/lib/types";
import { SettlementUploadForm } from "./settlement-upload-form";

export default async function SettlementUploadPage() {
  const supabase = await createClient();
  const channels = await supabase
    .from("channels")
    .select("*")
    .eq("active", true)
    .order("display_name")
    .then(unwrap<Channel[]>);

  return (
    <div>
      <PageHeader eyebrow="Data" title="Settlement Upload" />
      <SettlementUploadForm channels={channels ?? []} />
    </div>
  );
}
