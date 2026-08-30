"use client";

import { useState } from "react";
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
import type { Villa } from "@/lib/types";
import { createMapping } from "./actions";

export function MappingFormDialog({ villas }: { villas: Villa[] }) {
  const [open, setOpen] = useState(false);

  async function action(formData: FormData) {
    await createMapping(formData);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Mapping</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Villa Mapping</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="portfolio">Portfolio</Label>
              <Select name="portfolio" defaultValue="AASHA">
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
              <Select name="match_type" defaultValue="ROOM_NUMBER">
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
            <Input id="raw_value" name="raw_value" placeholder="e.g. 101, 1BRS" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="villa_id">Villa</Label>
            <Select name="villa_id" required>
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
            <Input id="priority" name="priority" type="number" defaultValue={0} />
            <p className="text-xs text-muted-foreground">
              Room-number matches should outrank room-type fallbacks.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add mapping</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
