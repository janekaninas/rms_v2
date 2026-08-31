"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recomputeReservations } from "@/lib/financial/recompute";

/**
 * FINANCIAL_LOGIC.md §7: Direct/Travel-Agent bookings use a flat agreed
 * rate, not dynamic nightly pricing — the confirmed daily allocation is
 * an even split, `approved_manual_revenue / stay_nights`. Single-step
 * approval throughout (PRODUCT_SPEC.md §8's deferred list — no
 * multi-level approval workflow), so this both creates and approves the
 * override in one action rather than a separate review step.
 */
export async function setManualRevenueOverride(reservationId: string, formData: FormData) {
  const supabase = await createClient();

  const manualRevenueRaw = formData.get("manual_revenue");
  const manualRevenue = manualRevenueRaw ? Number(manualRevenueRaw) : NaN;
  if (!Number.isFinite(manualRevenue) || manualRevenue < 0) {
    throw new Error("Enter a valid non-negative manual revenue amount.");
  }

  const { data: reservation, error: resError } = await supabase
    .from("reservations")
    .select("system_gross_revenue")
    .eq("id", reservationId)
    .single();
  if (resError) throw new Error(resError.message);

  const { error } = await supabase.from("revenue_overrides").upsert(
    {
      reservation_id: reservationId,
      system_revenue: reservation.system_gross_revenue ?? 0,
      manual_revenue: manualRevenue,
      final_revenue: manualRevenue,
      status: "APPROVED",
      approved_at: new Date().toISOString(),
    },
    { onConflict: "reservation_id" },
  );
  if (error) throw new Error(error.message);

  await supabase
    .from("reservations")
    .update({ manual_revenue_override: manualRevenue, override_status: "APPROVED" })
    .eq("id", reservationId);

  await recomputeReservations(supabase, [reservationId]);

  revalidatePath("/commercial/all-bookings");
}
