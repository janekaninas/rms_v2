import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/unwrap";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Owner, Villa, VillaGroup } from "@/lib/types";
import { VillaFormDialog } from "./villa-form-dialog";

export default async function VillasPage() {
  const supabase = await createClient();

  const [villas, owners, villaGroups] = await Promise.all([
    supabase
      .from("villas")
      // villa_groups is disambiguated: villas has both a direct villa_group_id
      // FK and a many-to-many path via villa_group_members, so PostgREST
      // can't infer which relationship to embed without this hint.
      .select("*, owners(name), villa_groups!villas_villa_group_id_fkey(name)")
      .order("villa_code")
      .then(unwrap),
    supabase.from("owners").select("*").order("name").then(unwrap<Owner[]>),
    supabase.from("villa_groups").select("*").order("name").then(unwrap<VillaGroup[]>),
  ]);

  const typedOwners = owners ?? [];
  const typedGroups = villaGroups ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Villas"
        actions={
          <VillaFormDialog
            owners={typedOwners}
            villaGroups={typedGroups}
            trigger={<Button>Add Villa</Button>}
          />
        }
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Portfolio</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead>Managed From</TableHead>
              <TableHead>Managed To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!villas || villas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                  No villas yet. Add one to get started, or import the initial baseline
                  snapshot (Day 2).
                </TableCell>
              </TableRow>
            ) : (
              villas.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.villa_code}</TableCell>
                  <TableCell>{v.name}</TableCell>
                  <TableCell>{v.portfolio}</TableCell>
                  <TableCell>{v.owners?.name ?? "—"}</TableCell>
                  <TableCell>{v.villa_groups?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{v.unit_count}</TableCell>
                  <TableCell>{v.management_start_date}</TableCell>
                  <TableCell>{v.management_end_date ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        v.active
                          ? "border-positive/30 bg-positive/10 text-positive"
                          : "border-border bg-muted text-muted-foreground"
                      }
                    >
                      {v.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <VillaFormDialog
                      villa={v as unknown as Villa}
                      owners={typedOwners}
                      villaGroups={typedGroups}
                      trigger={
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      }
                    />
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
