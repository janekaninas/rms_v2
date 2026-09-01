"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCellDrilldown, type CellDrilldownRow } from "./actions";

function fmt(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function CellDrilldown({
  villaId,
  villaLabel,
  date,
  children,
}: {
  villaId: string;
  villaLabel: string;
  date: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CellDrilldownRow[] | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && rows === null) {
      setLoading(true);
      try {
        setRows(await getCellDrilldown(villaId, date));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl" style={{ maxWidth: "min(96vw, 48rem)" }}>
        <SheetHeader>
          <SheetTitle>
            {villaLabel} — {date}
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reservation</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">PB1</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!rows || rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                        No reservation occupies this villa on this date.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.reservationId}>
                        <TableCell className="font-medium">{r.reservationNumber}</TableCell>
                        <TableCell>{r.guestName ?? "—"}</TableCell>
                        <TableCell>{r.channelName ?? "—"}</TableCell>
                        <TableCell>
                          {r.isActual ? (
                            <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive">
                              Actual
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-accent bg-accent text-accent-foreground">
                              Estimated
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                        <TableCell className="text-right">{fmt(r.commission)}</TableCell>
                        <TableCell className="text-right">{fmt(r.commissionVat)}</TableCell>
                        <TableCell className="text-right">{fmt(r.pb1)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(r.netRevenue)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
