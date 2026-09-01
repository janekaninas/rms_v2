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
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;

  // Range is January of the current calendar year through 12 months ahead
  // of the current month — dynamic, recomputed from `today` on every
  // request, never hardcoded to a specific year. Worked example: today =
  // September 2026 → Jan 2026 through Sep 2027 (not "current month through
  // December", which hid Jan–Aug entirely).
  const startIdx = currentYear * 12; // January of currentYear, 0-based
  const endIdx = currentYear * 12 + (currentMonth - 1) + 12;
  const periods: { year: number; month: number }[] = [];
  for (let idx = startIdx; idx <= endIdx; idx++) {
    periods.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }

  const rows = await Promise.all(
    periods.map(async ({ year, month }) => {
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
        {monthLabel(periods[0].year, periods[0].month)} through{" "}
        {monthLabel(periods[periods.length - 1].year, periods[periods.length - 1].month)} — January of the current
        year through 12 months ahead, recalculated from today&apos;s date. A villa with an open MISSING_PAYMENT_RULE
        exception on any date in a month has that date excluded from its Revenue/ARR figures here — see Monthly
        Performance for which dates are affected.
      </p>
    </div>
  );
}
