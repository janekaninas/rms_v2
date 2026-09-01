import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { MonthSelector } from "@/components/month-selector";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { monthLabel } from "@/lib/reporting/period";
import { loadRoadToTargetData, type RoadToTargetRow } from "@/lib/reporting/road-to-target";

function fmtNumber(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtOrDash(v: number | null) {
  return v === null ? "—" : fmtNumber(v);
}

function fmtPct(v: number | null) {
  return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
}

function fmtGap(v: number | null) {
  if (v === null) return "—";
  if (v <= 0) return "Secured";
  return fmtNumber(v);
}

/** Guards the two distinct divide-by-zero cases per REPORTING_LOGIC.md §8:
 * a gap already closed ("Secured") vs. a gap that can't close in the time
 * remaining ("Unreachable") — never a crash or an infinite number. */
function fmtRequired(value: number | null, target: number | null, gap: number | null) {
  if (target === null) return "—";
  if (gap !== null && gap <= 0) return "Secured";
  if (value === null) return "Unreachable";
  return fmtNumber(value);
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${warn ? "text-amber-700" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function PortfolioStats({ row }: { row: RoadToTargetRow }) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <StatCard label="Portfolio Target" value={fmtOrDash(row.target)} />
      <StatCard label="Currently Booked" value={fmtNumber(row.currentlyBookedRevenue)} warn={row.excludedChannels.length > 0} />
      <StatCard label="Achievement" value={fmtPct(row.achievementPct)} />
      <StatCard label="Gap to Target" value={fmtGap(row.gap)} />
      <StatCard
        label="Avg Required Pickup/Day"
        value={fmtRequired(row.requiredRevenuePerRemainingDay, row.target, row.gap)}
      />
      <StatCard label="Remaining Available RN" value={fmtNumber(row.remainingAvailableRoomNights)} />
      <StatCard
        label="Required ARR on Remaining RN"
        value={fmtRequired(row.requiredArrOnRemainingRn, row.target, row.gap)}
      />
    </div>
  );
}

export default async function RoadToTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const today = new Date();
  const year = Number(params.year) || today.getUTCFullYear();
  const month = Number(params.month) || today.getUTCMonth() + 1;

  const supabase = await createClient();
  const data = await loadRoadToTargetData(supabase, year, month);

  return (
    <div>
      <PageHeader eyebrow="Commercial" title="Road to Target" actions={<MonthSelector year={year} month={month} />} />

      {data.portfolio.target === null ? (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No portfolio revenue target configured for {monthLabel(year, month)} —{" "}
          <Link href="/configuration/revenue-targets" className="underline">
            add one in Configuration → Revenue Targets
          </Link>
          . Figures below stay blank rather than a guessed or carried-forward target.
        </div>
      ) : null}
      {data.portfolio.excludedChannels.length > 0 ? (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="mb-2">
            {data.portfolio.excludedChannels.length === 1 ? "A channel has" : "These channels have"} an open
            MISSING_PAYMENT_RULE exception this month — their reservations&apos; nights are excluded from Currently
            Booked Revenue until a payment rule is configured:
          </p>
          <div className="flex flex-wrap gap-2">
            {data.portfolio.excludedChannels.map((c) => (
              <Link
                key={c.id}
                href={`/configuration/channel-payment-rules?channel=${c.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                {c.name} — Configure
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <PortfolioStats row={data.portfolio} />

      <h2 className="mb-3 text-sm font-medium text-foreground">Villa Performance</h2>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Villa</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Currently Booked</TableHead>
              <TableHead className="text-right">Achievement</TableHead>
              <TableHead className="text-right">Gap</TableHead>
              <TableHead className="text-right">Req. Pickup/Day</TableHead>
              <TableHead className="text-right">Remaining Avail. RN</TableHead>
              <TableHead className="text-right">Req. ARR on Remaining RN</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.villaRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No villa has a revenue target configured for {monthLabel(year, month)}. Add one in Configuration →
                  Revenue Targets to see it here — a villa is never shown with a fabricated target.
                </TableCell>
              </TableRow>
            ) : (
              data.villaRows.map((row) => (
                <TableRow key={row.villa!.id}>
                  <TableCell className="font-medium">
                    {row.villa!.villa_code} — {row.villa!.name}
                  </TableCell>
                  <TableCell className="text-right">{fmtOrDash(row.target)}</TableCell>
                  <TableCell className="text-right">
                    {fmtNumber(row.currentlyBookedRevenue)}
                    {row.excludedChannels.length > 0 ? (
                      <span
                        title={`Some nights excluded — MISSING_PAYMENT_RULE: ${row.excludedChannels.map((c) => c.name).join(", ")}`}
                        className="ml-1 text-amber-700"
                      >
                        *
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">{fmtPct(row.achievementPct)}</TableCell>
                  <TableCell className="text-right">{fmtGap(row.gap)}</TableCell>
                  <TableCell className="text-right">{fmtRequired(row.requiredRevenuePerRemainingDay, row.target, row.gap)}</TableCell>
                  <TableCell className="text-right">{fmtNumber(row.remainingAvailableRoomNights)}</TableCell>
                  <TableCell className="text-right">{fmtRequired(row.requiredArrOnRemainingRn, row.target, row.gap)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/commercial/monthly-performance?year=${year}&month=${month}`}
                      className="text-sm text-accent-foreground underline"
                    >
                      View
                    </Link>
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
