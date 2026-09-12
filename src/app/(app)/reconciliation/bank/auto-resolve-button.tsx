"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runAutoResolveAction } from "./actions";

/** One-time backfill for exact-reference-and-amount pairs that were already committed before this detection existed — new uploads auto-resolve this on their own from now on. */
export function AutoResolveButton() {
  const [running, setRunning] = useState(false);

  async function handleClick() {
    setRunning(true);
    try {
      const { resolvedCount } = await runAutoResolveAction();
      if (resolvedCount > 0) {
        toast.success(`Auto-resolved ${resolvedCount} exact match(es).`);
      } else {
        toast.info("No unambiguous exact matches found to resolve.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={running}>
      {running ? "Checking…" : "Auto-resolve exact matches"}
    </Button>
  );
}
