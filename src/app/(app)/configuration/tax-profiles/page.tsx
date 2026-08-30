import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/unwrap";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Villa, VillaTaxProfile } from "@/lib/types";
import { AssignmentFormDialog } from "./assignment-form-dialog";

export default async function TaxProfilesPage() {
  const supabase = await createClient();

  const [typedProfiles, assignments, typedVillas] = await Promise.all([
    supabase.from("villa_tax_profiles").select("*").order("name").then(unwrap<VillaTaxProfile[]>),
    supabase
      .from("villa_tax_profile_assignments")
      .select("*, villas(villa_code, name), villa_tax_profiles(name)")
      .order("effective_from", { ascending: false })
      .then(unwrap),
    supabase.from("villas").select("*").order("villa_code").then(unwrap<Villa[]>),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader eyebrow="Configuration" title="Tax Profiles" />

        <h2 className="mb-3 text-sm font-medium text-foreground">Profiles</h2>
        <div className="mb-8 rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>PB1 Applicable</TableHead>
                <TableHead className="text-right">Service Charge Extraction</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedProfiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.pb1_applicable ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right">
                    {p.service_charge_extraction_pct
                      ? `${(p.service_charge_extraction_pct * 100).toFixed(0)}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {p.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Villa Assignments</h2>
          <AssignmentFormDialog villas={typedVillas} profiles={typedProfiles} />
        </div>
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Villa</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!assignments || assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No assignments yet. New villas get the confirmed standard/legacy
                    assignments automatically when added.
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.villas ? `${a.villas.villa_code} — ${a.villas.name}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.villa_tax_profiles?.name}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.effective_from} → {a.effective_to ?? "ongoing"}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {a.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
