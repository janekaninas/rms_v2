"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AllBookingsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="mb-4 flex items-center gap-3">
      <Input
        placeholder="Search reservation # or guest name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") updateParam("q", search);
        }}
        onBlur={() => updateParam("q", search)}
        className="max-w-xs"
      />
      <Select
        defaultValue={searchParams.get("status") ?? "ALL"}
        onValueChange={(v) => updateParam("status", v === "ALL" ? "" : v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All statuses</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="CANCELLED">Cancelled</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
