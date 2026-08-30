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
import type { RevenueTarget, Villa } from "@/lib/types";
import { upsertTarget } from "./actions";

export function TargetFormDialog({
  villas,
  target,
  trigger,
}: {
  villas: Villa[];
  target?: RevenueTarget;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isPortfolio = target ? target.villa_id === null : undefined;
  const [scope, setScope] = useState<"portfolio" | "villa">(
    isPortfolio === false ? "villa" : "portfolio",
  );

  async function action(formData: FormData) {
    if (scope === "portfolio") {
      formData.delete("villa_id");
    }
    await upsertTarget(formData);
    setOpen(false);
  }

  const now = new Date();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{target ? "Edit Target" : "Add Target"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          {!target ? (
            <div className="space-y-1.5">
              <Label htmlFor="scope">Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
                <SelectTrigger id="scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portfolio">Portfolio (explicit, not derived)</SelectItem>
                  <SelectItem value="villa">Villa-level</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {scope === "villa" ? (
            <div className="space-y-1.5">
              <Label htmlFor="villa_id">Villa</Label>
              <Select name="villa_id" defaultValue={target?.villa_id ?? undefined} required>
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
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                name="year"
                type="number"
                defaultValue={target?.year ?? now.getFullYear()}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                name="month"
                type="number"
                min={1}
                max={12}
                defaultValue={target?.month ?? now.getMonth() + 1}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revenue_target">Revenue Target (IDR)</Label>
            <Input
              id="revenue_target"
              name="revenue_target"
              type="number"
              step="1"
              defaultValue={target?.revenue_target}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="occupancy_target">Occupancy Target (%)</Label>
              <Input
                id="occupancy_target"
                name="occupancy_target"
                type="number"
                step="0.01"
                defaultValue={target?.occupancy_target ?? undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arr_target">ARR Target (IDR)</Label>
              <Input
                id="arr_target"
                name="arr_target"
                type="number"
                defaultValue={target?.arr_target ?? undefined}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={target?.notes ?? undefined} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save target</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
