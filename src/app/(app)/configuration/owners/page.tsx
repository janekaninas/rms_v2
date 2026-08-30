import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/unwrap";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Owner } from "@/lib/types";
import { OwnerFormDialog } from "./owner-form-dialog";

export default async function OwnersPage() {
  const supabase = await createClient();
  const owners = await supabase.from("owners").select("*").order("name").then(unwrap<Owner[]>);

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Owners"
        actions={<OwnerFormDialog trigger={<Button>Add Owner</Button>} />}
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Payout Reference</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!owners || owners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No owners yet.
                </TableCell>
              </TableRow>
            ) : (
              (owners as Owner[]).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell>{o.contact_email ?? "—"}</TableCell>
                  <TableCell>{o.contact_phone ?? "—"}</TableCell>
                  <TableCell>{o.default_bank_account_ref ?? "—"}</TableCell>
                  <TableCell>
                    <OwnerFormDialog
                      owner={o}
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
