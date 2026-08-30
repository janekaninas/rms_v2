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
import type { Owner } from "@/lib/types";
import { createOwner, updateOwner } from "./actions";

export function OwnerFormDialog({
  owner,
  trigger,
}: {
  owner?: Owner;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(owner);

  async function action(formData: FormData) {
    if (isEdit && owner) {
      await updateOwner(owner.id, formData);
    } else {
      await createOwner(formData);
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Owner" : "Add Owner"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={owner?.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_email">Contact Email</Label>
            <Input
              id="contact_email"
              name="contact_email"
              type="email"
              defaultValue={owner?.contact_email ?? undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_phone">Contact Phone</Label>
            <Input
              id="contact_phone"
              name="contact_phone"
              defaultValue={owner?.contact_phone ?? undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default_bank_account_ref">Payout Reference</Label>
            <Input
              id="default_bank_account_ref"
              name="default_bank_account_ref"
              placeholder="Free-text bank account reference"
              defaultValue={owner?.default_bank_account_ref ?? undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={owner?.notes ?? undefined} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save changes" : "Add owner"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
