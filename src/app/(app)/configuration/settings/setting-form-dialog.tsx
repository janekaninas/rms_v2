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
import type { AppSetting } from "@/lib/types";
import { upsertSetting } from "./actions";

export function SettingFormDialog({
  setting,
  trigger,
}: {
  setting?: AppSetting;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  async function action(formData: FormData) {
    await upsertSetting(formData);
    setOpen(false);
  }

  const displayValue =
    typeof setting?.value === "string" ? setting.value : JSON.stringify(setting?.value ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{setting ? "Edit Setting" : "Add Setting"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="key">Key</Label>
            <Input id="key" name="key" defaultValue={setting?.key} disabled={Boolean(setting)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="value">Value</Label>
            <Input id="value" name="value" defaultValue={displayValue} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" defaultValue={setting?.description ?? undefined} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
