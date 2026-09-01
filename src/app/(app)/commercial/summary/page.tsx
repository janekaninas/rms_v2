import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { monthLabel } from "@/lib/reporting/period";
import { loadMonthlyPerformanceData, rollupVilla, aggregateRollups } from "@/lib/reporting/monthly-rollup";
import Link from "next/link";

function fmtNumber(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null) {
  return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
}

function fmtArr(v: number | null) {
  return v === null ? "—" : fmtNumber(v);
}

/**
 * REPORTING_LOGIC.md §3: the same daily_revenue + reservations aggregation
 * as Monthly Performance (via loadMonthlyPerformanceData/rollupVilla), just
 * summed across all villas in a portfolio per month instead of shown
 * per-villa-per-date — never a divergent calculation path.
 */
export default async function SummaryPage() {
  const supabase = await createClient();
  const today = new Date();
  const year = today.getUTCFullYear();
  const startMonth = today.getUTCMonth() + 1;

  const months = [];
  for (let m = startMonth; m <= 12; m++) months.push(m);

  const rows = await Promise.all(
    months.map(async (month) => {
      const data = await loadMonthlyPerformanceData(supabase, year, month);
      const aashaRollups = data.aasha.map((v) => rollupVilla(v, data));
      const balinestRollups = data.balinest.map((v) => rollupVilla(v, data));
      const combined = aggregateRollups([...aashaRollups, ...balinestRollups]);
      return {
        year,
        month,
        aasha: aggregateRollups(aashaRollups),
        balinest: aggregateRollups(balinestRollups),
        combined,
      };
    }),
  );

  return (
    <div>
      <PageHeader eyebrow="Commercial" title="Summary" />

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2}>Month</TableHead>
              <TableHead colSpan={4} className="border-l text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                Aasha
              </TableHead>
              <TableHead colSpan={4} className="border-l text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                Balinest
              </TableHead>
              <TableHead colSpan={4} className="border-l text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                Combined
              </TableHead>
            </TableRow>
            <TableRow>
              {["Aasha", "Balinest", "Combined"].map((group) => (
                <Fragment key={group}>
                  <TableHead className="border-l text-right">Revenue</TableHead>
                  <TableHead className="text-right">Occ %</TableHead>
                  <TableHead className="text-right">ARR</TableHead>
                  <TableHead className="text-right">RN Sold</TableHead>
                </Fragment>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.year}-${row.month}`}>
                <TableCell className="font-medium">
                  <Link
                    href={`/commercial/monthly-performance?year=${row.year}&month=${row.month}`}
                    className="hover:underline"
                  >
                    {monthLabel(row.year, row.month)}
                  </Link>
                </TableCell>
                <TableCell className="border-l text-right">{fmtNumber(row.aasha.monthlyNetRevenue)}</TableCell>
                <TableCell className="text-right">{fmtPct(row.aasha.occupancyPct)}</TableCell>
                <TableCell className="text-right">{fmtArr(row.aasha.arr)}</TableCell>
                <TableCell className="text-right">{fmtNumber(row.aasha.roomNightsSold)}</TableCell>
                <TableCell className="border-l text-right">{fmtNumber(row.balinest.monthlyNetRevenue)}</TableCell>
                <TableCell className="text-right">{fmtPct(row.balinest.occupancyPct)}</TableCell>
                <TableCell className="text-right">{fmtArr(row.balinest.arr)}</TableCell>
                <TableCell className="text-right">{fmtNumber(row.balinest.roomNightsSold)}</TableCell>
                <TableCell className="border-l text-right font-medium">{fmtNumber(row.combined.monthlyNetRevenue)}</TableCell>
                <TableCell className="text-right font-medium">{fmtPct(row.combined.occupancyPct)}</TableCell>
                <TableCell className="text-right font-medium">{fmtArr(row.combined.arr)}</TableCell>
                <TableCell className="text-right font-medium">{fmtNumber(row.combined.roomNightsSold)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {monthLabel(year, startMonth)} through December {year}. A villa with an open MISSING_PAYMENT_RULE exception on
        any date this month has that date excluded from its Revenue/ARR figures here — see Monthly Performance for
        which dates are affected.
      </p>
    </div>
  );
}
