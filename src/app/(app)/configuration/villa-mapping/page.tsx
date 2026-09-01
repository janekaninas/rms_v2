import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/unwrap";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RoomVillaMapping, Villa } from "@/lib/types";
import { MappingFormDialog } from "./mapping-form-dialog";
import { DeleteMappingButton } from "./delete-mapping-button";

interface UnresolvedGroup {
  roomNumber: string | null;
  roomType: string | null;
  count: number;
}

export default async function VillaMappingPage() {
  const supabase = await createClient();

  const [mappings, villas, unknownVillaExceptions] = await Promise.all([
    supabase
      .from("room_villa_mapping")
      .select("*, villas(villa_code, name)")
      .order("priority", { ascending: false })
      .then(unwrap),
    supabase.from("villas").select("*").order("villa_code").then(unwrap<Villa[]>),
    supabase
      .from("reconciliation_exceptions")
      .select("detail")
      .eq("type", "UNKNOWN_VILLA")
      .eq("status", "OPEN")
      .then(unwrap<{ detail: unknown }[]>),
  ]);

  // DATA_MODEL.md §8: UNKNOWN_VILLA carries { roomNumber, roomType } —
  // group so Jane sees "this raw value affects N reservations" once, not
  // one row per reservation.
  const unresolvedGroups = new Map<string, UnresolvedGroup>();
  for (const e of unknownVillaExceptions ?? []) {
    const detail = e.detail as { roomNumber?: string | null; roomType?: string | null } | null;
    const roomNumber = detail?.roomNumber ?? null;
    const roomType = detail?.roomType ?? null;
    const key = `${roomNumber ?? ""} ${roomType ?? ""}`;
    const existing = unresolvedGroups.get(key);
    if (existing) existing.count++;
    else unresolvedGroups.set(key, { roomNumber, roomType, count: 1 });
  }
  const unresolvedList = [...unresolvedGroups.values()];

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Villa Mapping"
        actions={<MappingFormDialog villas={villas} />}
      />

      {unresolvedList.length > 0 ? (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="mb-2 font-medium">
            {unresolvedList.length} unmapped raw value{unresolvedList.length === 1 ? "" : "s"} (UNKNOWN_VILLA) —
            add a mapping to resolve the affected reservations immediately, no re-upload needed.
          </p>
          <div className="flex flex-wrap gap-2">
            {unresolvedList.map((g) => (
              <MappingFormDialog
                key={`${g.roomNumber ?? ""}-${g.roomType ?? ""}`}
                villas={villas}
                defaultMatchType={g.roomNumber ? "ROOM_NUMBER" : "ROOM_TYPE"}
                defaultRawValue={g.roomNumber ?? g.roomType ?? ""}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  >
                    {g.roomNumber ?? g.roomType ?? "—"} ({g.count}) — Map it
                  </button>
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Portfolio</TableHead>
              <TableHead>Match Type</TableHead>
              <TableHead>Raw Value</TableHead>
              <TableHead>Villa</TableHead>
              <TableHead className="text-right">Priority</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!mappings || mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No mappings yet. An unmapped raw value raises{" "}
                  <code className="text-xs">UNKNOWN_VILLA</code> during import.
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.portfolio}</TableCell>
                  <TableCell>{m.match_type}</TableCell>
                  <TableCell className="font-medium">{m.raw_value}</TableCell>
                  <TableCell>
                    {m.villas ? `${m.villas.villa_code} — ${m.villas.name}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">{m.priority}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <MappingFormDialog
                        mapping={m as unknown as RoomVillaMapping}
                        villas={villas}
                        trigger={
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteMappingButton id={m.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
