export interface OccupancyReservation {
  id: string;
  villa_id: string | null;
  arrival_date: string;
  departure_date: string;
  status: "ACTIVE" | "CANCELLED";
}

/**
 * REPORTING_LOGIC.md §2a: occupied nights are counted at the reservation
 * grain (arrival <= date < departure, ACTIVE only) so a future date still
 * reflects the current booking position even before its Room Revenue
 * Breakdown exists. One pass over the already-fetched reservations for
 * every date in the month — not one query per villa x date cell (§2e).
 */
export function computeOccupancyByVillaDate(
  reservations: OccupancyReservation[],
  dates: string[],
): Map<string, Map<string, number>> {
  const byVilla = new Map<string, Map<string, number>>();
  const dateSet = dates;

  for (const r of reservations) {
    if (r.status !== "ACTIVE" || !r.villa_id) continue;
    let dateMap = byVilla.get(r.villa_id);
    if (!dateMap) {
      dateMap = new Map();
      byVilla.set(r.villa_id, dateMap);
    }
    for (const date of dateSet) {
      if (r.arrival_date <= date && date < r.departure_date) {
        dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
      }
    }
  }

  return byVilla;
}
