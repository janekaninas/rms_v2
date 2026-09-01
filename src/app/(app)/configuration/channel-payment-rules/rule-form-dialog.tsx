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
import type { Channel, Villa, VillaGroup } from "@/lib/types";
import { createRule } from "./actions";

export function RuleFormDialog({
  channels,
  villas,
  villaGroups,
  defaultChannelId,
}: {
  channels: Channel[];
  villas: Villa[];
  villaGroups: VillaGroup[];
  /** From a MISSING_PAYMENT_RULE "fix this" link (?channel=<id>) — preselects the channel and opens the dialog immediately, so the fix is one click away rather than landing on the list page. */
  defaultChannelId?: string;
}) {
  const [open, setOpen] = useState(!!defaultChannelId);
  const [scope, setScope] = useState<"default" | "villa" | "villa_group">("default");

  async function action(formData: FormData) {
    await createRule(formData);
    setOpen(false);
    setScope("default");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Rule</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Channel Payment Rule</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="channel_id">Channel</Label>
            <Select name="channel_id" required defaultValue={defaultChannelId}>
              <SelectTrigger id="channel_id" className="w-full">
                <SelectValue placeholder="Select a channel" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scope">Scope</Label>
            <Select
              name="scope"
              value={scope}
              onValueChange={(v) => setScope(v as typeof scope)}
            >
              <SelectTrigger id="scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Channel-wide default</SelectItem>
                <SelectItem value="villa_group">Villa group override</SelectItem>
                <SelectItem value="villa">Villa-specific override</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Resolution order: villa-specific &gt; villa-group &gt; channel-wide default.
            </p>
          </div>

          {scope === "villa" ? (
            <div className="space-y-1.5">
              <Label htmlFor="villa_id">Villa</Label>
              <Select name="villa_id">
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

          {scope === "villa_group" ? (
            <div className="space-y-1.5">
              <Label htmlFor="villa_group_id">Villa Group</Label>
              <Select name="villa_group_id">
                <SelectTrigger id="villa_group_id" className="w-full">
                  <SelectValue placeholder="Select a villa group" />
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
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="source_amount_basis">Source Amount Basis</Label>
              <Select name="source_amount_basis" required>
                <SelectTrigger id="source_amount_basis" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GROSS_BEFORE_OTA_DEDUCTIONS">Gross before OTA deductions</SelectItem>
                  <SelectItem value="NET_AFTER_OTA_DEDUCTIONS">Net after OTA deductions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment_model">Payment Model</Label>
              <Select name="payment_model" required>
                <SelectTrigger id="payment_model" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NET_REMITTANCE">Net remittance</SelectItem>
                  <SelectItem value="GROSS_REMITTANCE_INVOICE_LATER">
                    Gross remittance, invoiced later
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="commission_rate">Commission Rate</Label>
              <Input id="commission_rate" name="commission_rate" type="number" step="0.0001" placeholder="0.15" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment_service_fee_rate">Service Fee Rate</Label>
              <Input
                id="payment_service_fee_rate"
                name="payment_service_fee_rate"
                type="number"
                step="0.0001"
                placeholder="0.023"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commission_vat_rate">VAT Rate</Label>
              <Input
                id="commission_vat_rate"
                name="commission_vat_rate"
                type="number"
                step="0.0001"
                defaultValue={0.11}
              />
            </div>
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
            <Label htmlFor="priority">Priority</Label>
            <Input id="priority" name="priority" type="number" defaultValue={0} />
            <p className="text-xs text-muted-foreground">
              Only matters as a tie-break among rules at the same specificity level.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add rule</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
