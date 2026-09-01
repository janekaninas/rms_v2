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
import type { Channel, SettlementBatchStatus } from "@/lib/types";
import { loadSettlementBatches } from "@/lib/settlement/reconciliation";
import { BatchDrilldown } from "./batch-drilldown";
import { SettlementFilters } from "./filters";

function fmt(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

const STATUS_STYLE: Record<SettlementBatchStatus, string> = {
  PENDING: "border-border bg-muted text-muted-foreground",
  PARTIALLY_SETTLED: "border-accent bg-accent text-accent-foreground",
  SETTLED: "border-positive/30 bg-positive/10 text-positive",
  VARIANCE: "border-red-200 bg-red-50 text-red-600",
  NEEDS_REVIEW: "border-amber-200 bg-amber-50 text-amber-700",
};

export default async function OtaSettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; from?: string; to?: string; status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const channels = await supabase.from("channels").select("*").order("display_name").then(unwrap<Channel[]>);

  const batches = await loadSettlementBatches(supabase, {
    channelId: params.channel || undefined,
    fromDate: params.from || undefined,
    toDate: params.to || undefined,
    status: (params.status as SettlementBatchStatus) || undefined,
  });

  return (
    <div>
      <PageHeader eyebrow="Reconciliation" title="OTA Settlement" />

      <SettlementFilters channels={channels ?? []} />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Settled</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Lines</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No settlement batches yet. Use Data → Settlement Upload to import or record one.
                </TableCell>
              </TableRow>
            ) : (
              batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.channelName}</TableCell>
                  <TableCell>
                    <BatchDrilldown batchId={b.id}>
                      <button type="button" className="font-medium hover:underline">
                        {b.batchReference ?? b.id.slice(0, 8)}
                      </button>
                    </BatchDrilldown>
                  </TableCell>
                  <TableCell>{b.batchDate}</TableCell>
                  <TableCell className="text-right">{fmt(b.expectedTotal)}</TableCell>
                  <TableCell className="text-right">{fmt(b.netSettlementAmount)}</TableCell>
                  <TableCell className="text-right">
                    {b.variance !== null ? (
                      fmt(b.variance)
                    ) : b.status === "PENDING" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="text-amber-700">MISSING_PAYMENT_RULE</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLE[b.status]}>
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {b.lineCount}
                    {b.unresolvedLineCount > 0 ? (
                      <span className="ml-1 text-xs text-amber-700">({b.unresolvedLineCount} unresolved)</span>
                    ) : null}
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
