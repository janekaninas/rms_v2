"use client";

import { Fragment, useState } from "react";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReservationDrilldown } from "../../commercial/all-bookings/reservation-drilldown";
import { getBatchDrilldown } from "./actions";
import type { SettlementBatchDetail } from "@/lib/settlement/reconciliation";

function fmt(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function MatchBadge({ status }: { status: string }) {
  if (status === "MATCHED") return <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive">Matched</Badge>;
  if (status === "PARTIALLY_MATCHED") return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Needs review</Badge>;
  return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">Unmatched</Badge>;
}

export function BatchDrilldown({ batchId, children }: { batchId: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SettlementBatchDetail | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && data === null) {
      setLoading(true);
      try {
        setData(await getBatchDrilldown(batchId));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl" style={{ maxWidth: "min(96vw, 56rem)" }}>
          <SheetHeader className="gap-1 border-b pb-4">
            <SheetTitle>
              {data ? `${data.channelName} — ${data.batchReference ?? data.batchDate}` : "Settlement Batch"}
            </SheetTitle>
            {data ? (
              <p className="text-xs text-muted-foreground">
                Gross {fmt(data.grossSettlementAmount)} + Adjustments {fmt(data.adjustmentAmount)} = Net{" "}
                {fmt(data.netSettlementAmount)}
              </p>
            ) : null}
          </SheetHeader>

          <div className="px-4 pb-6 pt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !data ? (
              <p className="text-sm text-muted-foreground">Not found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Reservation Ref</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Reservation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((l) => (
                    <Fragment key={l.id}>
                      <TableRow>
                        <TableCell>{l.lineType}</TableCell>
                        <TableCell>{l.rawReservationReference ?? "—"}</TableCell>
                        <TableCell className="text-right">{fmt(l.amount)}</TableCell>
                        <TableCell>
                          <MatchBadge status={l.matchedStatus} />
                        </TableCell>
                        <TableCell>
                          {l.allocatedReservation ? (
                            <ReservationDrilldown
                              reservationId={l.allocatedReservation.id}
                              reservationNumber={l.allocatedReservation.reservationNumber}
                              guestName={l.allocatedReservation.guestName}
                              channelId={l.allocatedReservation.channelId}
                              channelName={l.allocatedReservation.channelName}
                              villaLabel={l.allocatedReservation.villaLabel}
                              arrivalDate={l.allocatedReservation.arrivalDate}
                              departureDate={l.allocatedReservation.departureDate}
                              status={l.allocatedReservation.status}
                              nights={l.allocatedReservation.nightAllocations}
                              hasApprovedOverride={l.allocatedReservation.hasApprovedOverride}
                              trigger={
                                <Button variant="outline" size="sm">
                                  {l.allocatedReservation.reservationNumber}
                                </Button>
                              }
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {l.extraFields ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="bg-muted/20 py-2">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {Object.entries(l.extraFields).map(([k, v]) => (
                                <span key={k}>
                                  <span className="font-medium text-foreground">{k}:</span> {v}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
    </Sheet>
  );
}
