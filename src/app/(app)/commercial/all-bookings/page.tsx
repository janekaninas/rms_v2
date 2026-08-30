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

const PAGE_SIZE = 50;

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
    .select("*, villas(villa_code, name), channels(display_name)", { count: "exact" })
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

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reservation #</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Villa</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Arrival</TableHead>
              <TableHead>Departure</TableHead>
              <TableHead className="text-right">Nights</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!reservations || reservations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No reservations yet. Use Data → Daily Upload to import bookings.
                </TableCell>
              </TableRow>
            ) : (
              reservations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.reservation_number}</TableCell>
                  <TableCell>{r.guest_name ?? "—"}</TableCell>
                  <TableCell>
                    {r.channels?.display_name ?? (
                      <span className="text-amber-700">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.villas ? `${r.villas.villa_code} — ${r.villas.name}` : (
                      <span className="text-amber-700">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell>{r.room_number || r.room_type || "—"}</TableCell>
                  <TableCell>{r.arrival_date}</TableCell>
                  <TableCell>{r.departure_date}</TableCell>
                  <TableCell className="text-right">{r.nights}</TableCell>
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
                </TableRow>
              ))
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
