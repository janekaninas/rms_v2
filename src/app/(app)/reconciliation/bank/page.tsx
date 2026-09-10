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
import type { BankAccount, BankReconciliationStatus, Channel } from "@/lib/types";
import { loadBankReconciliationRows } from "@/lib/bank/reconciliation";
import { BankReconciliationFiltersBar } from "./filters";
import { RowDrilldown } from "./row-drilldown";

function fmt(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

const STATUS_STYLE: Record<BankReconciliationStatus, string> = {
  AWAITING_SETTLEMENT: "border-border bg-muted text-muted-foreground",
  AWAITING_BANK: "border-border bg-muted text-muted-foreground",
  MATCHED: "border-positive/30 bg-positive/10 text-positive",
  PARTIAL: "border-accent bg-accent text-accent-foreground",
  VARIANCE: "border-red-200 bg-red-50 text-red-600",
  UNMATCHED: "border-red-200 bg-red-50 text-red-600",
  NEEDS_REVIEW: "border-amber-200 bg-amber-50 text-amber-700",
};

export default async function BankReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; channel?: string; from?: string; to?: string; status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [bankAccounts, channels] = await Promise.all([
    supabase.from("bank_accounts").select("*").order("bank_name").then(unwrap<BankAccount[]>),
    supabase.from("channels").select("*").order("display_name").then(unwrap<Channel[]>),
  ]);

  const { rows } = await loadBankReconciliationRows(supabase, {
    bankAccountId: params.account || undefined,
    channelId: params.channel || undefined,
    fromDate: params.from || undefined,
    toDate: params.to || undefined,
    status: (params.status as BankReconciliationStatus) || undefined,
  });

  return (
    <div>
      <PageHeader eyebrow="Reconciliation" title="Bank Reconciliation" />

      <BankReconciliationFiltersBar bankAccounts={bankAccounts ?? []} channels={channels ?? []} />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead>Settlement Reference</TableHead>
              <TableHead>Settlement Date</TableHead>
              <TableHead className="text-right">Expected Settlement</TableHead>
              <TableHead className="text-right">OTA Settlement</TableHead>
              <TableHead className="text-right">Bank Received</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No settlement batches or bank transactions yet. Use Data → Bank Mutation Upload to import a BCA statement.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    {r.channelName ?? <span className="text-muted-foreground">—</span>}
                    {r.orphanTransactionId && r.channelName ? (
                      <span className="ml-1 text-xs text-muted-foreground">(suggested)</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <RowDrilldown settlementBatchId={r.settlementBatchId ?? undefined} orphanTransactionId={r.orphanTransactionId ?? undefined}>
                      <button type="button" className="font-medium hover:underline">
                        {r.settlementReference ?? (r.orphanTransactionId ? "Unmatched bank transaction" : r.key.slice(0, 8))}
                      </button>
                    </RowDrilldown>
                  </TableCell>
                  <TableCell>{r.settlementDate ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(r.expectedSettlement)}</TableCell>
                  <TableCell className="text-right">{fmt(r.otaSettlementAmount)}</TableCell>
                  <TableCell className="text-right">{fmt(r.bankReceived)}</TableCell>
                  <TableCell className="text-right">{fmt(r.difference)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLE[r.status]}>
                      {r.status}
                    </Badge>
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
