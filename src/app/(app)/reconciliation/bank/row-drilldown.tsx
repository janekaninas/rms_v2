"use client";

import { useState } from "react";
import { toast } from "sonner";
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
import { getBatchBankDrilldown, getOrphanTransactionDrilldown, confirmMatchAction, type BatchBankDrilldown, type OrphanTransactionDrilldown } from "./actions";
import type { BankMatchMethod } from "@/lib/types";

function fmt(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.85) return <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive">High</Badge>;
  if (confidence >= 0.6) return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Medium</Badge>;
  return <Badge variant="outline" className="bg-muted text-muted-foreground">Low</Badge>;
}

/** One drill-down sheet, doubling as batch view (settlementBatchId set) or orphan-transaction view (orphanTransactionId set) — REPORTING_LOGIC.md §11's single unified row model. */
export function RowDrilldown({
  settlementBatchId,
  orphanTransactionId,
  children,
}: {
  settlementBatchId?: string;
  orphanTransactionId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [batchData, setBatchData] = useState<BatchBankDrilldown | null>(null);
  const [orphanData, setOrphanData] = useState<OrphanTransactionDrilldown | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      if (settlementBatchId) setBatchData(await getBatchBankDrilldown(settlementBatchId));
      else if (orphanTransactionId) setOrphanData(await getOrphanTransactionDrilldown(orphanTransactionId));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && batchData === null && orphanData === null) await load();
  }

  async function handleConfirm(batchId: string, amount: number, method: BankMatchMethod) {
    if (!orphanTransactionId) return;
    setConfirming(batchId);
    try {
      await confirmMatchAction({ bankTransactionId: orphanTransactionId, settlementBatchId: batchId, allocatedAmount: amount, matchMethod: method });
      toast.success("Match confirmed.");
      setOrphanData(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfirming(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl" style={{ maxWidth: "min(96vw, 48rem)" }}>
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : batchData ? (
          <>
            <SheetHeader className="gap-1 border-b pb-4">
              <SheetTitle>
                {batchData.batch ? `${batchData.batch.channelName} — ${batchData.batch.batchReference ?? batchData.batch.batchDate}` : "Settlement Batch"}
              </SheetTitle>
              {batchData.batch ? (
                <p className="text-xs text-muted-foreground">
                  Net settlement {fmt(batchData.batch.netSettlementAmount)} — {batchData.allocatedTransactions.length} bank transaction(s) allocated
                </p>
              ) : null}
            </SheetHeader>
            <div className="px-4 pb-6 pt-4">
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Allocated bank transactions</h4>
              {batchData.allocatedTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bank transaction allocated yet — awaiting bank.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchData.allocatedTransactions.map((t) => (
                      <TableRow key={t.transactionId}>
                        <TableCell className="text-xs">{t.transactionDate}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs">{t.description}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(t.allocatedAmount)}</TableCell>
                        <TableCell className="text-xs">{t.matchMethod}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <h4 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">Settlement lines</h4>
              {batchData.batch ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Reservation Ref</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchData.batch.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.lineType}</TableCell>
                        <TableCell className="text-xs">{l.rawReservationReference ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(l.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          </>
        ) : orphanData ? (
          <>
            <SheetHeader className="gap-1 border-b pb-4">
              <SheetTitle>Unmatched bank transaction</SheetTitle>
              {orphanData.transaction ? (
                <p className="text-xs text-muted-foreground">
                  {orphanData.transaction.bankAccountName} — {orphanData.transaction.transactionDate} — {fmt(orphanData.transaction.amount)}
                </p>
              ) : null}
            </SheetHeader>
            <div className="px-4 pb-6 pt-4">
              {orphanData.transaction ? (
                <p className="mb-4 text-xs text-muted-foreground">{orphanData.transaction.description}</p>
              ) : null}

              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Candidate settlement batches</h4>
              {orphanData.suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No plausible settlement batch found — leave unmatched, or confirm manually once the right batch exists.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orphanData.suggestions.map((s) => (
                      <TableRow key={s.settlementBatchId}>
                        <TableCell className="text-xs">{s.channelName}</TableCell>
                        <TableCell className="text-xs">
                          {s.batchReference ?? s.settlementBatchId.slice(0, 8)} ({s.batchDate})
                        </TableCell>
                        <TableCell className="text-right text-xs">{fmt(s.netSettlementAmount)}</TableCell>
                        <TableCell>
                          <ConfidenceBadge confidence={s.confidence} />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={confirming === s.settlementBatchId}
                            onClick={() => handleConfirm(s.settlementBatchId, orphanData.transaction?.amount ?? s.netSettlementAmount, s.matchMethod)}
                          >
                            {confirming === s.settlementBatchId ? "Confirming…" : "Confirm match"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Not found.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
