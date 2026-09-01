"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteVillaIfSafe, toggleVillaActive } from "./actions";

export function VillaRowActions({ villaId, active }: { villaId: string; active: boolean }) {
  async function handleToggle() {
    try {
      await toggleVillaActive(villaId, !active);
      toast.success(active ? "Villa deactivated." : "Villa reactivated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update this villa.");
    }
  }

  async function handleRemove() {
    if (!confirm("Remove this villa? This only succeeds if nothing references it yet.")) return;
    try {
      await deleteVillaIfSafe(villaId);
      toast.success("Villa removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove this villa.");
    }
  }

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={handleToggle}>
        {active ? "Deactivate" : "Reactivate"}
      </Button>
      <Button variant="outline" size="sm" onClick={handleRemove}>
        Remove
      </Button>
    </div>
  );
}
