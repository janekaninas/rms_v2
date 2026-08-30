"use client";

import { Button } from "@/components/ui/button";
import { deleteMapping } from "./actions";

export function DeleteMappingButton({ id }: { id: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (confirm("Remove this mapping?")) {
          deleteMapping(id);
        }
      }}
    >
      Remove
    </Button>
  );
}
