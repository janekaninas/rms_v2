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
import type { RevenueTarget, Villa } from "@/lib/types";
import { TargetFormDialog } from "./target-form-dialog";

function formatIdr(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function RevenueTargetsPage() {
  const supabase = await createClient();

  const [targets, typedVillas] = await Promise.all([
    supabase
      .from("revenue_targets")
      .select("*, villas(villa_code, name)")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .then(unwrap),
    supabase.from("villas").select("*").order("villa_code").then(unwrap<Villa[]>),
  ]);

  const portfolioTargets = targets.filter((t) => t.villa_id === null);
  const villaTargets = targets.filter((t) => t.villa_id !== null);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          eyebrow="Configuration"
          title="Revenue Targets"
          actions={
            <TargetFormDialog villas={typedVillas} trigger={<Button>Add Target</Button>} />
          }
        />

        <h2 className="mb-3 text-sm font-medium text-foreground">Portfolio Targets</h2>
        <div className="mb-8 rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Revenue Target</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolioTargets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No portfolio target set.
                  </TableCell>
                </TableRow>
              ) : (
                portfolioTargets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {MONTH_NAMES[t.month - 1]} {t.year}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatIdr(t.revenue_target)}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {t.notes ?? "—"}
                    </TableCell>
                    <TableCell>
                      <TargetFormDialog
                        villas={typedVillas}
                        target={t as unknown as RevenueTarget}
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

        <h2 className="mb-3 text-sm font-medium text-foreground">Villa Targets</h2>
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Villa</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Revenue Target</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {villaTargets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No villa-level targets set yet.
                  </TableCell>
                </TableRow>
              ) : (
                villaTargets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.villas ? `${t.villas.villa_code} — ${t.villas.name}` : "—"}
                    </TableCell>
                    <TableCell>
                      {MONTH_NAMES[t.month - 1]} {t.year}
                    </TableCell>
                    <TableCell className="text-right">{formatIdr(t.revenue_target)}</TableCell>
                    <TableCell>
                      <TargetFormDialog
                        villas={typedVillas}
                        target={t as unknown as RevenueTarget}
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
    </div>
  );
}
