import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/unwrap";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Villa } from "@/lib/types";
import { MappingFormDialog } from "./mapping-form-dialog";
import { DeleteMappingButton } from "./delete-mapping-button";

export default async function VillaMappingPage() {
  const supabase = await createClient();

  const [mappings, villas] = await Promise.all([
    supabase
      .from("room_villa_mapping")
      .select("*, villas(villa_code, name)")
      .order("priority", { ascending: false })
      .then(unwrap),
    supabase.from("villas").select("*").order("villa_code").then(unwrap<Villa[]>),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Villa Mapping"
        actions={<MappingFormDialog villas={villas} />}
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Portfolio</TableHead>
              <TableHead>Match Type</TableHead>
              <TableHead>Raw Value</TableHead>
              <TableHead>Villa</TableHead>
              <TableHead className="text-right">Priority</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!mappings || mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No mappings yet. An unmapped raw value raises{" "}
                  <code className="text-xs">UNKNOWN_VILLA</code> during import.
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.portfolio}</TableCell>
                  <TableCell>{m.match_type}</TableCell>
                  <TableCell className="font-medium">{m.raw_value}</TableCell>
                  <TableCell>
                    {m.villas ? `${m.villas.villa_code} — ${m.villas.name}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">{m.priority}</TableCell>
                  <TableCell>
                    <DeleteMappingButton id={m.id} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
