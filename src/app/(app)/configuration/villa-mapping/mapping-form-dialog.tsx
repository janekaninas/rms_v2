"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RoomVillaMapping, Villa } from "@/lib/types";
import { createMapping, updateMapping } from "./actions";
import type { ReresolveVillasResult } from "@/lib/import/reresolve-villas";

function announceReresolve(result: ReresolveVillasResult) {
  if (result.changedCount === 0) {
    toast.success("Mapping saved. No existing reservations were affected.");
    return;
  }
  const parts: string[] = [];
  if (result.newlyResolvedCount > 0) parts.push(`${result.newlyResolvedCount} newly resolved`);
  if (result.newlyUnresolvedCount > 0) parts.push(`${result.newlyUnresolvedCount} now unresolved`);
  const remapped = result.changedCount - result.newlyResolvedCount - result.newlyUnresolvedCount;
  if (remapped > 0) parts.push(`${remapped} moved to a different villa`);
  toast.success(`Mapping saved — ${result.changedCount} reservation(s) updated from existing data (${parts.join(", ")}).`);
}

export function MappingFormDialog({
  mapping,
  villas,
  trigger,
  defaultMatchType,
  defaultRawValue,
}: {
  mapping?: RoomVillaMapping;
  villas: Villa[];
  trigger?: React.ReactNode;
  /** From an "Unresolved" UNKNOWN_VILLA quick-fix action — prefills the new mapping and opens the dialog immediately. */
  defaultMatchType?: "ROOM_NUMBER" | "ROOM_TYPE";
  defaultRawValue?: string;
}) {
  const [open, setOpen] = useState(!!defaultRawValue);
  const isEdit = Boolean(mapping);

  async function action(formData: FormData) {
    try {
      const result = isEdit && mapping ? await updateMapping(mapping.id, formData) : await createMapping(formData);
      setOpen(false);
      announceReresolve(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this mapping.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>Add Mapping</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Villa Mapping" : "Add Villa Mapping"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="portfolio">Portfolio</Label>
              <Select name="portfolio" defaultValue={mapping?.portfolio ?? "AASHA"}>
                <SelectTrigger id="portfolio" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AASHA">Aasha</SelectItem>
                  <SelectItem value="BALINEST">Balinest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="match_type">Match Type</Label>
              <Select name="match_type" defaultValue={mapping?.match_type ?? defaultMatchType ?? "ROOM_NUMBER"}>
                <SelectTrigger id="match_type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROOM_NUMBER">Room Number</SelectItem>
                  <SelectItem value="ROOM_TYPE">Room Type</SelectItem>
                  <SelectItem value="LISTING">Listing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="raw_value">Raw Value</Label>
            <Input
              id="raw_value"
              name="raw_value"
              defaultValue={mapping?.raw_value ?? defaultRawValue}
              placeholder="e.g. 101, 1BRS"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="villa_id">Villa</Label>
            <Select name="villa_id" defaultValue={mapping?.villa_id} required>
              <SelectTrigger id="villa_id" className="w-full">
                <SelectValue placeholder="Select a villa" />
              </SelectTrigger>
              <SelectContent>
                {villas.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.villa_code} — {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="priority">Priority</Label>
            <Input id="priority" name="priority" type="number" defaultValue={mapping?.priority ?? 0} />
            <p className="text-xs text-muted-foreground">
              Room-number matches should outrank room-type fallbacks.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Saving re-resolves every existing reservation from its already-stored room number/type — no re-upload
            needed.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save changes" : "Add mapping"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
