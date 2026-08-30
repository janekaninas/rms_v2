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
import { createChannel } from "./actions";

export function ChannelFormDialog() {
  const [open, setOpen] = useState(false);

  async function action(formData: FormData) {
    await createChannel(formData);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add Channel</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Channel</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="raw_name">Raw Name</Label>
            <Input
              id="raw_name"
              name="raw_name"
              placeholder="As it appears in the source export"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="display_name">Display Name</Label>
            <Input id="display_name" name="display_name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="channel_type">Type</Label>
            <Select name="channel_type" defaultValue="OTA">
              <SelectTrigger id="channel_type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OTA">OTA</SelectItem>
                <SelectItem value="TRAVEL_AGENT">Travel Agent</SelectItem>
                <SelectItem value="DIRECT">Direct</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add channel</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
