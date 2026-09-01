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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NightAllocation } from "@/lib/financial/allocate";
import { setManualRevenueOverride } from "./actions";

function fmt(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium" title={value}>
        {value}
      </div>
    </div>
  );
}

export function ReservationDrilldown({
  reservationId,
  reservationNumber,
  guestName,
  channelName,
  villaLabel,
  arrivalDate,
  departureDate,
  status,
  nights,
  hasApprovedOverride,
  trigger,
}: {
  reservationId: string;
  reservationNumber: string;
  guestName: string | null;
  channelName: string | null;
  villaLabel: string | null;
  arrivalDate: string;
  departureDate: string;
  status: string;
  nights: NightAllocation[];
  hasApprovedOverride: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  async function handleOverride(formData: FormData) {
    await setManualRevenueOverride(reservationId, formData);
  }

  const incomplete = nights.some((n) => n.netRevenue === null);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-4xl"
        style={{ maxWidth: "min(96vw, 56rem)" }}
      >
        <div id="reservation-print-area">
          <SheetHeader className="gap-3 border-b pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle>Reservation {reservationNumber}</SheetTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-8 print:hidden"
                onClick={() => window.print()}
              >
                Print
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <SummaryField label="Guest" value={guestName ?? "—"} />
              <SummaryField label="Channel" value={channelName ?? "—"} />
              <SummaryField label="Villa" value={villaLabel ?? "—"} />
              <SummaryField label="Status" value={status} />
              <SummaryField label="Arrival" value={arrivalDate} />
              <SummaryField label="Departure" value={departureDate} />
            </div>
          </SheetHeader>

          <div className="space-y-6 px-4 pt-4">
            {incomplete ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 print:hidden">
                No channel payment rule resolves for this reservation — figures below are
                incomplete, not final (MISSING_PAYMENT_RULE).
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stay Date</TableHead>
                  <TableHead>Source</TableHead>
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
                      No stay dates on this reservation yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  nights.map((n) => (
                    <TableRow key={n.stayDate}>
                      <TableCell>{n.stayDate}</TableCell>
                      <TableCell>
                        {n.isActual ? (
                          <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive">
                            Actual
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-accent bg-accent text-accent-foreground">
                            Estimated
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{fmt(n.amount)}</TableCell>
                      <TableCell className="text-right">{fmt(n.commission)}</TableCell>
                      <TableCell className="text-right">{fmt(n.commissionVat)}</TableCell>
                      <TableCell className="text-right">{fmt(n.serviceChargeExtraction)}</TableCell>
                      <TableCell className="text-right">{fmt(n.pb1)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(n.netRevenue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        </div>

        <div className="px-4 pb-6 print:hidden">
          <div className="rounded-lg border p-4">
            <h3 className="mb-1 text-sm font-medium text-foreground">Manual Revenue Override</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              For Direct / Individual / Travel Agent bookings with a flat agreed rate, or to
              correct a wrong system figure — allocated as an even split across every stay
              night, taking precedence over both the Booking/Arrival Report total and Room
              Revenue Breakdown.
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
