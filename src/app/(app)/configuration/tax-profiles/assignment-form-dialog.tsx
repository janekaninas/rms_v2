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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Villa, VillaTaxProfile } from "@/lib/types";
import { createAssignment } from "./actions";

export function AssignmentFormDialog({
  villas,
  profiles,
}: {
  villas: Villa[];
  profiles: VillaTaxProfile[];
}) {
  const [open, setOpen] = useState(false);

  async function action(formData: FormData) {
    await createAssignment(formData);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add Manual Assignment</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Tax Profile Assignment</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            New villas already get the confirmed standard/legacy assignments automatically.
            Use this only for a correction or an edge case.
          </p>
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
            <Label htmlFor="tax_profile_id">Tax Profile</Label>
            <Select name="tax_profile_id" required>
              <SelectTrigger id="tax_profile_id" className="w-full">
                <SelectValue placeholder="Select a profile" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="effective_from">Effective From</Label>
              <Input id="effective_from" name="effective_from" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="effective_to">Effective To</Label>
              <Input id="effective_to" name="effective_to" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add assignment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
