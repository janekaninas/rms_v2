"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMapping } from "./actions";

export function DeleteMappingButton({ id }: { id: string }) {
  async function handleDelete() {
    if (!confirm("Remove this mapping? Reservations relying on it may become unresolved (UNKNOWN_VILLA).")) return;
    try {
      const result = await deleteMapping(id);
      if (result.changedCount === 0) {
        toast.success("Mapping removed. No existing reservations were affected.");
      } else {
        toast.success(
          `Mapping removed — ${result.changedCount} reservation(s) re-resolved from existing data (${result.newlyUnresolvedCount} now unresolved).`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove this mapping.");
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDelete}>
      Remove
    </Button>
  );
}
