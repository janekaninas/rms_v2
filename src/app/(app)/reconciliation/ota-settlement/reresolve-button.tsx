"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reresolveUnmatchedLinesAction } from "./actions";

/** One-time backfill for settlement lines stuck UNMATCHED before a reservation's voucher_number was captured — new imports already re-check this on their own. */
export function ReresolveButton() {
  const [running, setRunning] = useState(false);

  async function handleClick() {
    setRunning(true);
    try {
      const { resolvedCount } = await reresolveUnmatchedLinesAction();
      if (resolvedCount > 0) {
        toast.success(`Re-matched ${resolvedCount} settlement line(s) to a reservation.`);
      } else {
        toast.info("No previously-unmatched lines now resolve.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={running}>
      {running ? "Checking…" : "Re-check unmatched lines"}
    </Button>
  );
}
