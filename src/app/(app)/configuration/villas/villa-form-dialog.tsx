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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Owner, Villa, VillaGroup } from "@/lib/types";
import { createVilla, updateVilla } from "./actions";

export function VillaFormDialog({
  villa,
  owners,
  villaGroups,
  trigger,
}: {
  villa?: Villa;
  owners: Owner[];
  villaGroups: VillaGroup[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(villa);

  async function action(formData: FormData) {
    if (isEdit && villa) {
      await updateVilla(villa.id, formData);
    } else {
      await createVilla(formData);
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Villa" : "Add Villa"}</DialogTitle>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="villa_code">Villa Code</Label>
              <Input
                id="villa_code"
                name="villa_code"
                defaultValue={villa?.villa_code}
                disabled={isEdit}
                required
                placeholder="e.g. AMN1"
              />
              {isEdit ? (
                <p className="text-xs text-muted-foreground">Immutable once assigned.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={villa?.name} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="portfolio">Portfolio</Label>
              <Select name="portfolio" defaultValue={villa?.portfolio ?? "AASHA"}>
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
              <Label htmlFor="unit_count">Unit Count</Label>
              <Input
                id="unit_count"
                name="unit_count"
                type="number"
                min={1}
                defaultValue={villa?.unit_count ?? 1}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="owner_id">Owner</Label>
              <Select name="owner_id" defaultValue={villa?.owner_id ?? undefined}>
                <SelectTrigger id="owner_id" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="villa_group_id">Villa Group</Label>
              <Select name="villa_group_id" defaultValue={villa?.villa_group_id ?? undefined}>
                <SelectTrigger id="villa_group_id" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {villaGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="management_start_date">Management Start Date</Label>
              <Input
                id="management_start_date"
                name="management_start_date"
                type="date"
                defaultValue={villa?.management_start_date}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="management_end_date">Management End Date</Label>
              <Input
                id="management_end_date"
                name="management_end_date"
                type="date"
                defaultValue={villa?.management_end_date ?? undefined}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank if still under management. Inclusive on both ends.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="active" name="active" defaultChecked={villa?.active ?? true} />
            <Label htmlFor="active" className="font-normal text-muted-foreground">
              Active (current-config filter only — historical reports use management dates)
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save changes" : "Add villa"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
