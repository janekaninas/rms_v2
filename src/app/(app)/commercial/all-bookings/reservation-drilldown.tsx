"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setManualRevenueOverride } from "./actions";

export interface DrilldownNight {
  stay_date: string;
  revenue_type: string;
  commercial_revenue_basis_amount: number;
  commission: number | null;
  commission_vat: number | null;
  service_charge_extraction: number | null;
  pb1: number | null;
  net_revenue: number | null;
}

function fmt(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function ReservationDrilldown({
  reservationId,
  reservationNumber,
  nights,
  hasApprovedOverride,
  trigger,
}: {
  reservationId: string;
  reservationNumber: string;
  nights: DrilldownNight[];
  hasApprovedOverride: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  async function handleOverride(formData: FormData) {
    await setManualRevenueOverride(reservationId, formData);
  }

  const incomplete = nights.some((n) => n.net_revenue === null);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Reservation {reservationNumber}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {incomplete ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              No channel payment rule resolves for this reservation — figures below are
              incomplete, not final (MISSING_PAYMENT_RULE).
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stay Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Service Charge</TableHead>
                  <TableHead className="text-right">PB1</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nights.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      No revenue rows yet — import Room Revenue Breakdown for this stay.
                    </TableCell>
                  </TableRow>
                ) : (
                  nights.map((n) => (
                    <TableRow key={`${n.stay_date}-${n.revenue_type}`}>
                      <TableCell>{n.stay_date}</TableCell>
                      <TableCell className="text-xs">{n.revenue_type}</TableCell>
                      <TableCell className="text-right">{fmt(n.commercial_revenue_basis_amount)}</TableCell>
                      <TableCell className="text-right">{fmt(n.commission)}</TableCell>
                      <TableCell className="text-right">{fmt(n.commission_vat)}</TableCell>
                      <TableCell className="text-right">{fmt(n.service_charge_extraction)}</TableCell>
                      <TableCell className="text-right">{fmt(n.pb1)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(n.net_revenue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="mb-1 text-sm font-medium text-foreground">Manual Revenue Override</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              For Direct / Travel Agent bookings with a flat agreed rate — allocated as an even
              split across every stay night, replacing the imported per-night figures.
              {hasApprovedOverride ? " An override is currently approved for this reservation." : ""}
            </p>
            <form action={handleOverride} className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="manual_revenue">Approved Total Revenue (IDR)</Label>
                <Input id="manual_revenue" name="manual_revenue" type="number" step="1" required />
              </div>
              <Button type="submit">Set &amp; Approve</Button>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
