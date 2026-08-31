import { createClient } from "@/lib/supabase/server";
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
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AllBookingsFilters } from "./filters";
import { ReservationDrilldown, type DrilldownNight } from "./reservation-drilldown";

const PAGE_SIZE = 50;

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

  const [{ data: dailyRows }, { data: overrides }] = await Promise.all([
    reservationIds.length
      ? supabase
          .from("daily_revenue")
          .select("reservation_id, stay_date, revenue_type, commercial_revenue_basis_amount, commission, commission_vat, service_charge_extraction, pb1, net_revenue")
          .in("reservation_id", reservationIds)
      : Promise.resolve({ data: [] }),
    reservationIds.length
      ? supabase.from("revenue_overrides").select("reservation_id, status").in("reservation_id", reservationIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nightsByReservation = new Map<string, DrilldownNight[]>();
  for (const row of dailyRows ?? []) {
    const list = nightsByReservation.get(row.reservation_id as string) ?? [];
    list.push(row as unknown as DrilldownNight);
    nightsByReservation.set(row.reservation_id as string, list);
  }
  const approvedOverrideReservations = new Set(
    (overrides ?? []).filter((o) => o.status === "APPROVED").map((o) => o.reservation_id as string),
  );

  function aggregate(nights: DrilldownNight[]) {
    if (nights.length === 0) return null;
    const incomplete = nights.some((n) => n.net_revenue === null);
    if (incomplete) return { incomplete: true as const };
    return {
      incomplete: false as const,
      gross: nights.reduce((s, n) => s + n.commercial_revenue_basis_amount, 0),
      commission: nights.reduce((s, n) => s + (n.commission ?? 0), 0),
      vat: nights.reduce((s, n) => s + (n.commission_vat ?? 0), 0),
      pb1: nights.reduce((s, n) => s + (n.pb1 ?? 0), 0),
      net: nights.reduce((s, n) => s + (n.net_revenue ?? 0), 0),
    };
  }

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader eyebrow="Commercial" title="All Bookings" />

      <AllBookingsFilters />

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reservation #</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Villa</TableHead>
              <TableHead>Arrival</TableHead>
              <TableHead>Departure</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead className="text-right">PB1</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!reservations || reservations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="py-10 text-center text-sm text-muted-foreground">
                  No reservations yet. Use Data → Daily Upload to import bookings.
                </TableCell>
              </TableRow>
            ) : (
              reservations.map((r) => {
                const nights = nightsByReservation.get(r.id) ?? [];
                const agg = aggregate(nights);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.reservation_number}</TableCell>
                    <TableCell>{r.guest_name ?? "—"}</TableCell>
                    <TableCell>
                      {r.channels?.display_name ?? <span className="text-amber-700">Unknown</span>}
                    </TableCell>
                    <TableCell>
                      {r.villas ? `${r.villas.villa_code} — ${r.villas.name}` : <span className="text-amber-700">Unknown</span>}
                    </TableCell>
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
                    {agg === null ? (
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                        No revenue imported yet
                      </TableCell>
                    ) : agg.incomplete ? (
                      <TableCell colSpan={5} className="text-center text-xs text-amber-700">
                        Incomplete — MISSING_PAYMENT_RULE
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right">{fmt(agg.gross)}</TableCell>
                        <TableCell className="text-right">{fmt(agg.commission)}</TableCell>
                        <TableCell className="text-right">{fmt(agg.vat)}</TableCell>
                        <TableCell className="text-right">{fmt(agg.pb1)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(agg.net)}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <ReservationDrilldown
                        reservationId={r.id}
                        reservationNumber={r.reservation_number}
                        nights={nights}
                        hasApprovedOverride={approvedOverrideReservations.has(r.id)}
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
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
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
