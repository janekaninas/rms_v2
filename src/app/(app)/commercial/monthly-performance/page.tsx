import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { MonthSelector } from "@/components/month-selector";
import {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadMonthlyPerformanceData, rollupVilla, type VillaMonthlyRollup } from "@/lib/reporting/monthly-rollup";
import type { Villa } from "@/lib/types";
import { CellDrilldown } from "./cell-drilldown";
import { ViewToggle } from "./view-toggle";

const DATE_COL_WIDTH = 96;
const VILLA_COL_WIDTH = 84;
// shadcn's TableHead is a fixed h-10 (2.5rem); the two-row header relies on
// this being exact so row 2 can stick at precisely row 1's height rather
// than an estimate. If TableHead's height class ever changes, update this.
const HEADER_ROW_HEIGHT = 40;
// Footer rows get an explicit height (TableCell has no fixed height by
// default) for the same reason: sticky-bottom stacking needs to know each
// row's exact height to compute the next row's offset.
const FOOTER_ROW_HEIGHT = 32;
const FOOTER_ROWS = 4;

function fmtNumber(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function isManagedOnDate(villa: Villa, date: string): boolean {
  if (date < villa.management_start_date) return false;
  if (villa.management_end_date && date > villa.management_end_date) return false;
  return true;
}

function dateColStyle(extra?: CSSProperties): CSSProperties {
  return { position: "sticky", left: 0, width: DATE_COL_WIDTH, minWidth: DATE_COL_WIDTH, maxWidth: DATE_COL_WIDTH, ...extra };
}

export default async function MonthlyPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string }>;
}) {
  const params = await searchParams;
  const today = new Date();
  const year = Number(params.year) || today.getUTCFullYear();
  const month = Number(params.month) || today.getUTCMonth() + 1;
  const view = params.view === "revenue" ? "revenue" : "occupancy";

  const supabase = await createClient();
  const data = await loadMonthlyPerformanceData(supabase, year, month);
  const { aasha, balinest, dates, occupancyByVilla, revenueByVilla } = data;
  const orderedVillas = [...aasha, ...balinest];

  const footerRows = (
    [
      { label: "Room Nights Sold", render: (r: VillaMonthlyRollup) => fmtNumber(r.roomNightsSold) },
      {
        label: "Occupancy %",
        render: (r: VillaMonthlyRollup) => (r.occupancyPct === null ? "—" : `${(r.occupancyPct * 100).toFixed(0)}%`),
      },
      { label: "ARR", render: (r: VillaMonthlyRollup) => (r.arr === null ? "—" : fmtNumber(r.arr)) },
      { label: "Net Revenue", render: (r: VillaMonthlyRollup) => fmtNumber(r.monthlyNetRevenue) },
    ] as const
  ).map((row, i) => ({ ...row, bottomOffset: (FOOTER_ROWS - 1 - i) * FOOTER_ROW_HEIGHT }));

  return (
    // DESIGN_SYSTEM.md §3b: a self-contained, independently-scrolling report
    // screen — h-full fills exactly what the shared layout's main gives this
    // page (never more), so this page's own scrolling never becomes the
    // document's scrolling. The header below is shrink-0 (never scrolls);
    // only the matrix container underneath it scrolls, in both directions.
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <PageHeader
          eyebrow="Commercial"
          title="Monthly Performance"
          actions={
            <div className="flex items-center gap-3">
              <ViewToggle view={view} />
              <MonthSelector year={year} month={month} />
            </div>
          }
        />
      </div>

      {orderedVillas.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center text-sm text-muted-foreground">
          No villa is under management for this period yet.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
          {/*
            Deliberately a raw <table>, not the shared <Table> wrapper: that
            component hardcodes its own overflow-x-auto div around <table>,
            which would create a second, competing horizontal scroll context
            nested inside this one — breaking sticky-left positioning, which
            needs exactly one scrolling ancestor per axis (DESIGN_SYSTEM.md
            §3b). This div is that one ancestor for both axes.
          */}
          <table className="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow>
                <TableHead
                  style={dateColStyle({ top: 0, zIndex: 30 })}
                  className="bg-card"
                  rowSpan={2}
                >
                  Date
                </TableHead>
                {aasha.length > 0 && (
                  <TableHead
                    colSpan={aasha.length}
                    style={{ position: "sticky", top: 0, zIndex: 20 }}
                    className="border-l bg-card text-center text-[11px] uppercase tracking-wide text-muted-foreground"
                  >
                    Aasha
                  </TableHead>
                )}
                {balinest.length > 0 && (
                  <TableHead
                    colSpan={balinest.length}
                    style={{ position: "sticky", top: 0, zIndex: 20 }}
                    className="border-l bg-card text-center text-[11px] uppercase tracking-wide text-muted-foreground"
                  >
                    Balinest
                  </TableHead>
                )}
              </TableRow>
              <TableRow>
                {orderedVillas.map((v, i) => (
                  <TableHead
                    key={v.id}
                    title={v.name}
                    style={{
                      position: "sticky",
                      top: HEADER_ROW_HEIGHT,
                      zIndex: 20,
                      width: VILLA_COL_WIDTH,
                      minWidth: VILLA_COL_WIDTH,
                      maxWidth: VILLA_COL_WIDTH,
                    }}
                    className={`bg-card text-center ${i === 0 || i === aasha.length ? "border-l" : ""}`}
                  >
                    {v.villa_code}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dates.map((date) => (
                <TableRow key={date}>
                  <TableCell style={dateColStyle({ zIndex: 10 })} className="bg-card font-medium">
                    {date.slice(8, 10)}
                  </TableCell>
                  {orderedVillas.map((v, i) => {
                    const managed = isManagedOnDate(v, date);
                    const borderClass = i === 0 || i === aasha.length ? "border-l" : "";

                    if (!managed) {
                      return (
                        <TableCell key={v.id} className={`text-center text-muted-foreground/30 ${borderClass}`}>
                          ·
                        </TableCell>
                      );
                    }

                    if (view === "occupancy") {
                      const occupied = occupancyByVilla.get(v.id)?.get(date) ?? 0;
                      return (
                        <TableCell key={v.id} className={`p-0 text-center ${borderClass}`}>
                          <CellDrilldown villaId={v.id} villaLabel={`${v.villa_code} — ${v.name}`} date={date}>
                            <button
                              type="button"
                              className="flex h-full w-full items-center justify-center px-2 py-1.5 hover:bg-sidebar-accent"
                            >
                              {occupied > 0 ? occupied : <span className="text-muted-foreground/50">0</span>}
                            </button>
                          </CellDrilldown>
                        </TableCell>
                      );
                    }

                    // REPORTING_LOGIC.md §2a (corrected): an occupied night
                    // always shows a revenue figure — Actual where a Room
                    // Revenue row exists, Estimated (from the Booking/
                    // Arrival Report total) otherwise. Blank is reserved for
                    // zero occupancy; "Incomplete" only for a reservation
                    // with no booking total or no resolvable payment rule.
                    const occupiedForRevenue = occupancyByVilla.get(v.id)?.get(date) ?? 0;
                    if (occupiedForRevenue === 0) {
                      return (
                        <TableCell key={v.id} className={`text-center text-xs text-muted-foreground/50 ${borderClass}`}>
                          —
                        </TableCell>
                      );
                    }
                    const rev = revenueByVilla.get(v.id)?.get(date);
                    const missingRuleChannelNames = rev ? [...rev.missingRuleChannels.values()] : [];
                    return (
                      <TableCell key={v.id} className={`p-0 text-center ${borderClass}`}>
                        <CellDrilldown villaId={v.id} villaLabel={`${v.villa_code} — ${v.name}`} date={date}>
                          <button
                            type="button"
                            className="flex h-full w-full items-center justify-center px-1 py-1.5 text-xs hover:bg-sidebar-accent"
                          >
                            {!rev || missingRuleChannelNames.length > 0 ? (
                              // REPORTING_LOGIC.md §2a: "Incomplete" is reserved for a
                              // genuinely unresolvable channel payment rule — name the
                              // channel(s) so the fix is obvious; open the drill-down
                              // (this cell's own click target) for a direct link to
                              // Configuration → Channel Payment Rules per reservation.
                              <span
                                title={
                                  missingRuleChannelNames.length > 0
                                    ? `Missing channel payment rule: ${missingRuleChannelNames.join(", ")} — open this cell to fix`
                                    : "Missing booking total or unresolved channel payment rule"
                                }
                                className="text-amber-700"
                              >
                                Incomplete
                              </span>
                            ) : rev.missingTotal ? (
                              <span title="No booking total yet for this reservation — not a channel payment rule problem" className="text-muted-foreground">
                                No total
                              </span>
                            ) : (
                              <span
                                title={rev.allActual ? "Actual (Room Revenue Breakdown)" : "Includes an estimated night — Room Revenue Breakdown not yet uploaded for this date"}
                                className={rev.allActual ? undefined : "underline decoration-dotted decoration-accent-foreground"}
                              >
                                {fmtNumber(rev.netRevenue)}
                              </span>
                            )}
                          </button>
                        </CellDrilldown>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              {footerRows.map((row) => (
                <TableRow key={row.label} className="bg-muted/40 font-medium hover:bg-muted/40">
                  <TableCell
                    style={dateColStyle({ bottom: row.bottomOffset, zIndex: 30 })}
                    className="h-8 bg-muted/40 py-0"
                  >
                    {row.label}
                  </TableCell>
                  {orderedVillas.map((v, i) => {
                    const r = rollupVilla(v, data);
                    const borderClass = i === 0 || i === aasha.length ? "border-l" : "";
                    return (
                      <TableCell
                        key={v.id}
                        style={{ position: "sticky", bottom: row.bottomOffset, zIndex: 20 }}
                        className={`h-8 bg-muted/40 py-0 text-center text-xs ${borderClass}`}
                      >
                        {row.render(r)}
                        {row.label === "Net Revenue" && r.incompleteCount > 0 ? (
                          <span title={`${r.incompleteCount} date(s) incomplete — MISSING_PAYMENT_RULE`} className="ml-1 text-amber-700">
                            *
                          </span>
                        ) : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableFooter>
          </table>
        </div>
      )}
    </div>
  );
}
