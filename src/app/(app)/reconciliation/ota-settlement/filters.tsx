"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { Channel, SettlementBatchStatus } from "@/lib/types";

const STATUSES: SettlementBatchStatus[] = ["PENDING", "PARTIALLY_SETTLED", "SETTLED", "VARIANCE", "NEEDS_REVIEW"];

export function SettlementFilters({ channels }: { channels: Channel[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Select value={searchParams.get("channel") ?? "__all__"} onValueChange={(v) => setParam("channel", v === "__all__" ? "" : v)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All channels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All channels</SelectItem>
          {channels.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("status") ?? "__all__"} onValueChange={(v) => setParam("status", v === "__all__" ? "" : v)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All statuses</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        className="w-40"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => setParam("from", e.target.value)}
        aria-label="From date"
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        className="w-40"
        value={searchParams.get("to") ?? ""}
        onChange={(e) => setParam("to", e.target.value)}
        aria-label="To date"
      />
    </div>
  );
}
