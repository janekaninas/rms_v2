import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AllBookingsFilters } from "./filters";
import { ReservationDrilldown } from "./reservation-drilldown";
import { allocateReservationNights } from "@/lib/financial/allocate";
import { loadAllocationContext } from "@/lib/financial/context";

const PAGE_SIZE = 50;

// DESIGN_SYSTEM.md §9a: Reservation #/Guest/Channel/Villa stay pinned
// while the rest of the row scrolls horizontally. Fixed pixel widths
// (not just min-width) are required so a long value can't widen the
// frozen section and throw off the sticky `left` offsets below.
const FROZEN_COLS = [
  { key: "reservation", width: 120, left: 0 },
  { key: "guest", width: 240, left: 120 },
  { key: "channel", width: 170, left: 360 },
  { key: "villa", width: 280, left: 530 },
] as const;

function frozenStyle(colKey: (typeof FROZEN_COLS)[number]["key"], extra?: CSSProperties): CSSProperties {
  const col = FROZEN_COLS.find((c) => c.key === colKey)!;
  return { position: "sticky", left: col.left, width: col.width, minWidth: col.width, maxWidth: col.width, ...extra };
}

// DESIGN_SYSTEM.md §3b z-index scale: 10 = sticky-left body cells, 20 =
// sticky-top header cells, 30 = corner cells sticky in both directions
// (the four frozen columns' own header cells, here).
function headerStyle(): CSSProperties {
  return { position: "sticky", top: 0, zIndex: 20 };
}

function cornerHeaderStyle(): CSSProperties {
  return { position: "sticky", top: 0, zIndex: 30 };
}

function fmt(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default async function AllBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let query = supabase
    .from("reservations")
    .select(
      "*, villas(villa_code, name), channels(display_name)",
      { count: "exact" },
    )
    .eq("portfolio", "AASHA")
    .order("arrival_date", { ascending: false })
    .range(from, to);

  if (q) {
    query = query.or(`reservation_number.ilike.%${q}%,guest_name.ilike.%${q}%`);
  }
  if (status === "ACTIVE" || status === "CANCELLED") {
    query = query.eq("status", status);
  }

  const { data: reservations, count, error } = await query;
  if (error) throw new Error(error.message);

  const reservationIds = (reservations ?? []).map((r) => r.id);
  const channelIds = [...new Set((reservations ?? []).map((r) => r.channel_id).filter((v): v is string => v !== null))];
  const villaIds = [...new Set((reservations ?? []).map((r) => r.villa_id).filter((v): v is string => v !== null))];

  const [{ data: dailyRows }, { data: overrides }, allocationContext] = await Promise.all([
    reservationIds.length
      ? supabase
          .from("daily_revenue")
          .select("reservation_id, stay_date, commercial_revenue_basis_amount")
          .in("reservation_id", reservationIds)
          .eq("revenue_type", "STAY")
      : Promise.resolve({ data: [] }),
    reservationIds.length
      ? supabase.from("revenue_overrides").select("reservation_id, status").in("reservation_id", reservationIds)
      : Promise.resolve({ data: [] }),
    loadAllocationContext(supabase, villaIds, channelIds),
  ]);

  const actualByReservation = new Map<string, { stayDate: string; amount: number }[]>();
  for (const row of dailyRows ?? []) {
    const list = actualByReservation.get(row.reservation_id as string) ?? [];
    list.push({ stayDate: row.stay_date as string, amount: row.commercial_revenue_basis_amount as number });
    actualByReservation.set(row.reservation_id as string, list);
  }
  const approvedOverrideReservations = new Set(
    (overrides ?? []).filter((o) => o.status === "APPROVED").map((o) => o.reservation_id as string),
  );
  const { villaGroupByVilla, rules: ruleList, assignments: assignmentList, profiles: profileList } = allocationContext;

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  return (
    // DESIGN_SYSTEM.md §3b: same bounded, independently-scrolling pattern as
    // Monthly Performance — h-full/min-h-0 only resolves correctly because
    // the shared layout wrapper is a real h-full, and a shrink-0 zone keeps
    // the page header/filters fixed while only the table body scrolls.
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <PageHeader eyebrow="Commercial" title="All Bookings" />
        <AllBookingsFilters />
      </div>

      {/*
        Raw <table>, not the shared Table wrapper: that component hardcodes
        its own overflow-x-auto div around <table>, which would create a
        second, nested, competing horizontal scroll context — sticky-left
        cells need exactly one scrolling ancestor per axis (DESIGN_SYSTEM.md
        §3b).
      */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead style={frozenStyle("reservation", cornerHeaderStyle())} className="bg-card">Reservation #</TableHead>
              <TableHead style={frozenStyle("guest", cornerHeaderStyle())} className="bg-card">Guest</TableHead>
              <TableHead style={frozenStyle("channel", cornerHeaderStyle())} className="bg-card">Channel</TableHead>
              <TableHead style={frozenStyle("villa", cornerHeaderStyle())} className="border-r bg-card">Villa</TableHead>
              <TableHead style={headerStyle()} className="bg-card">Booking Date</TableHead>
              <TableHead style={headerStyle()} className="bg-card">Arrival</TableHead>
              <TableHead style={headerStyle()} className="bg-card">Departure</TableHead>
              <TableHead style={headerStyle()} className="bg-card">Status</TableHead>
              <TableHead style={headerStyle()} className="bg-card text-right">Gross</TableHead>
              <TableHead style={headerStyle()} className="bg-card text-right">Commission</TableHead>
              <TableHead style={headerStyle()} className="bg-card text-right">VAT</TableHead>
              <TableHead style={headerStyle()} className="bg-card text-right">PB1</TableHead>
              <TableHead style={headerStyle()} className="bg-card text-right">Net</TableHead>
              <TableHead style={headerStyle()} className="w-10 bg-card" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!reservations || reservations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="py-10 text-center text-sm text-muted-foreground">
                  No reservations yet. Use Data → Daily Upload to import bookings.
                </TableCell>
              </TableRow>
            ) : (
              reservations.map((r) => {
                const hasApprovedOverride = approvedOverrideReservations.has(r.id);
                const authoritativeTotal = r.final_gross_revenue ?? r.system_gross_revenue ?? null;
                const allocation = allocateReservationNights({
                  arrivalDate: r.arrival_date,
                  departureDate: r.departure_date,
                  authoritativeTotal,
                  actualRows: actualByReservation.get(r.id) ?? [],
                  channelId: r.channel_id,
                  villaId: r.villa_id,
                  villaGroupId: r.villa_id ? (villaGroupByVilla.get(r.villa_id) ?? null) : null,
                  rules: ruleList,
                  assignments: assignmentList,
                  profiles: profileList,
                });
                const gross = allocation.nights.reduce((s, n) => s + n.amount, 0);

                return (
                  <TableRow key={r.id}>
                    <TableCell style={frozenStyle("reservation")} className="z-10 bg-card font-medium">
                      <span className="block truncate" title={r.reservation_number}>
                        {r.reservation_number}
                      </span>
                    </TableCell>
                    <TableCell style={frozenStyle("guest")} className="z-10 bg-card">
                      <span className="block truncate" title={r.guest_name ?? undefined}>
                        {r.guest_name ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell style={frozenStyle("channel")} className="z-10 bg-card">
                      <span className="block truncate">
                        {r.channels?.display_name ?? <span className="text-amber-700">Unknown</span>}
                      </span>
                    </TableCell>
                    <TableCell style={frozenStyle("villa")} className="z-10 border-r bg-card">
                      <span className="block truncate">
                        {r.villas ? `${r.villas.villa_code} — ${r.villas.name}` : <span className="text-amber-700">Unknown</span>}
                      </span>
                    </TableCell>
                    <TableCell>{r.booking_date ?? "—"}</TableCell>
                    <TableCell>{r.arrival_date}</TableCell>
                    <TableCell>{r.departure_date}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          r.status === "ACTIVE"
                            ? "border-positive/30 bg-positive/10 text-positive"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    {authoritativeTotal === null ? (
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                        No booking total yet
                      </TableCell>
                    ) : allocation.missingPaymentRule ? (
                      <TableCell colSpan={5} className="text-center text-xs text-amber-700">
                        Incomplete — MISSING_PAYMENT_RULE
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right">{fmt(gross)}</TableCell>
                        <TableCell className="text-right">
                          {fmt(allocation.nights.reduce((s, n) => s + (n.commission ?? 0), 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(allocation.nights.reduce((s, n) => s + (n.commissionVat ?? 0), 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(allocation.nights.reduce((s, n) => s + (n.pb1 ?? 0), 0))}
                        </TableCell>
                        <TableCell className="text-right font-medium">{fmt(allocation.totalNetRevenue)}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <ReservationDrilldown
                        reservationId={r.id}
                        reservationNumber={r.reservation_number}
                        guestName={r.guest_name}
                        channelId={r.channel_id}
                        channelName={r.channels?.display_name ?? null}
                        villaLabel={r.villas ? `${r.villas.villa_code} — ${r.villas.name}` : null}
                        arrivalDate={r.arrival_date}
                        departureDate={r.departure_date}
                        status={r.status}
                        nights={allocation.nights}
                        hasApprovedOverride={hasApprovedOverride}
                        trigger={
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-3 flex shrink-0 items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} ({count} total)
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={pageHref(page - 1)} aria-disabled={page <= 1}>
                Prev
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
              <Link href={pageHref(page + 1)} aria-disabled={page >= totalPages}>
                Next
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
