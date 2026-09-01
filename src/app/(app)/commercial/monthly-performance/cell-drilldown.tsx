"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReservationDrilldown } from "../all-bookings/reservation-drilldown";
import { getCellDrilldown, type CellDrilldownData } from "./actions";

function fmt(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
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
  const [data, setData] = useState<CellDrilldownData | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && data === null) {
      setLoading(true);
      try {
        setData(await getCellDrilldown(villaId, date));
      } finally {
        setLoading(false);
      }
    }
  }

  const actualCount = data?.rows.filter((r) => r.isActual).length ?? 0;
  const estimatedCount = data ? data.rows.length - actualCount : 0;
  const composition =
    !data || data.rows.length === 0
      ? "—"
      : estimatedCount === 0
        ? "All Actual"
        : actualCount === 0
          ? "All Estimated"
          : `${actualCount} Actual, ${estimatedCount} Estimated`;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-4xl"
        style={{ maxWidth: "min(96vw, 56rem)" }}
      >
        <SheetHeader className="gap-3 border-b pb-4">
          <SheetTitle>
            {villaLabel} — {date}
          </SheetTitle>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <SummaryField label="Occupied / Available RN" value={data ? `${data.occupiedRoomNights} / ${data.villaUnitCount}` : "—"} />
            <SummaryField label="Total Commercial Revenue" value={data ? fmt(data.totals.commercialRevenue) : "—"} />
            <SummaryField label="Total Net Revenue" value={data ? fmt(data.totals.netRevenue) : "—"} />
            <SummaryField label="Composition" value={composition} />
          </div>
        </SheetHeader>

        <div className="px-4 pb-6 pt-4">
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
                    <TableHead>Arrival</TableHead>
                    <TableHead>Departure</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Commercial Rev.</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">PB1</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!data || data.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-6 text-center text-sm text-muted-foreground">
                        No reservation occupies this villa on this date.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.rows.map((r) => (
                      <TableRow key={r.reservationId}>
                        <TableCell className="font-medium">{r.reservationNumber}</TableCell>
                        <TableCell>{r.guestName ?? "—"}</TableCell>
                        <TableCell>
                          {r.channelName ?? "—"}
                          {r.netRevenue === null && r.channelId ? (
                            <Link
                              href={`/configuration/channel-payment-rules?channel=${r.channelId}`}
                              className="ml-2 text-xs text-amber-700 underline"
                              title={`No channel payment rule resolves for ${r.channelName ?? "this channel"} — configure it`}
                            >
                              Fix
                            </Link>
                          ) : null}
                        </TableCell>
                        <TableCell>{r.arrivalDate}</TableCell>
                        <TableCell>{r.departureDate}</TableCell>
                        <TableCell>{r.status}</TableCell>
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
                        <TableCell className="text-right">{fmt(r.commercialRevenue)}</TableCell>
                        <TableCell className="text-right">{fmt(r.commission)}</TableCell>
                        <TableCell className="text-right">{fmt(r.commissionVat)}</TableCell>
                        <TableCell className="text-right">{fmt(r.pb1)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(r.netRevenue)}</TableCell>
                        <TableCell>
                          <ReservationDrilldown
                            reservationId={r.reservationId}
                            reservationNumber={r.reservationNumber}
                            guestName={r.guestName}
                            channelId={r.channelId}
                            channelName={r.channelName}
                            villaLabel={villaLabel}
                            arrivalDate={r.arrivalDate}
                            departureDate={r.departureDate}
                            status={r.status}
                            nights={r.nights}
                            hasApprovedOverride={r.hasApprovedOverride}
                            trigger={
                              <Button variant="outline" size="sm">
                                View
                              </Button>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {data && data.rows.length > 0 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={7} className="font-medium">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmt(data.totals.commercialRevenue)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(data.totals.commission)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(data.totals.commissionVat)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(data.totals.pb1)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(data.totals.netRevenue)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
