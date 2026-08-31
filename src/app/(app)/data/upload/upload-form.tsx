"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ImportKind, ImportPreview, ResolvedRow } from "@/lib/import/types";
import type { RoomRevenuePreview, ResolvedRoomRevenueRow } from "@/lib/import/resolve-room-revenue";
import {
  previewImportAction,
  commitImportAction,
  previewRoomRevenueAction,
  commitRoomRevenueAction,
} from "./actions";

type UiKind = ImportKind | "ROOM_REVENUE";

const IMPORT_KIND_LABELS: Record<UiKind, string> = {
  BASELINE_RESERVATION_SNAPSHOT: "Baseline / Arrival Report Snapshot",
  NEW_BOOKINGS: "New Bookings",
  CANCELLATIONS: "Cancellations",
  ROOM_REVENUE: "Room Revenue Breakdown",
};

const PAGE_SIZE = 50;

function ActionBadge({ action }: { action: "NEW" | "UPDATE" | "UNCHANGED" | "ERROR" }) {
  if (action === "ERROR") return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">Error</Badge>;
  if (action === "NEW") return <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive">New</Badge>;
  if (action === "UPDATE") return <Badge variant="outline" className="border-accent bg-accent text-accent-foreground">Update</Badge>;
  return <Badge variant="outline" className="bg-muted text-muted-foreground">Unchanged</Badge>;
}

export function UploadForm() {
  const [importKind, setImportKind] = useState<UiKind>("NEW_BOOKINGS");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [roomRevenuePreview, setRoomRevenuePreview] = useState<RoomRevenuePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committedId, setCommittedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setCommittedId(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (importKind === "ROOM_REVENUE") {
        const p = await previewRoomRevenueAction(fd);
        setRoomRevenuePreview(p);
        setPreview(null);
      } else {
        const p = await previewImportAction(importKind, fd);
        setPreview(p);
        setRoomRevenuePreview(null);
      }
      setPage(0);
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
      setRoomRevenuePreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    setCommitting(true);
    setError(null);
    try {
      if (roomRevenuePreview) {
        const result = await commitRoomRevenueAction(roomRevenuePreview);
        setCommittedId(result.importId);
        setRoomRevenuePreview(null);
      } else if (preview) {
        const result = await commitImportAction(preview);
        setCommittedId(result.importId);
        setPreview(null);
      }
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  const reservationRows = preview?.rows ?? [];
  const roomRevenueRows = roomRevenuePreview?.rows ?? [];
  const totalRows = reservationRows.length || roomRevenueRows.length;
  const pageCount = Math.ceil(totalRows / PAGE_SIZE);
  const pagedReservationRows = reservationRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pagedRoomRevenueRows = roomRevenueRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const counts = preview?.counts ?? roomRevenuePreview?.counts ?? null;
  const commitLabel = preview
    ? `Commit ${preview.counts.new + preview.counts.updated} changes`
    : roomRevenuePreview
      ? `Commit ${roomRevenuePreview.counts.new + roomRevenuePreview.counts.updated} changes`
      : "Commit";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="import_kind">Import Type</Label>
            <Select value={importKind} onValueChange={(v) => setImportKind(v as UiKind)}>
              <SelectTrigger id="import_kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BASELINE_RESERVATION_SNAPSHOT">
                  {IMPORT_KIND_LABELS.BASELINE_RESERVATION_SNAPSHOT}
                </SelectItem>
                <SelectItem value="NEW_BOOKINGS">{IMPORT_KIND_LABELS.NEW_BOOKINGS}</SelectItem>
                <SelectItem value="CANCELLATIONS">{IMPORT_KIND_LABELS.CANCELLATIONS}</SelectItem>
                <SelectItem value="ROOM_REVENUE">{IMPORT_KIND_LABELS.ROOM_REVENUE}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="file">File (CSV)</Label>
            <input
              id="file"
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handlePreview} disabled={!file || loading}>
            {loading ? "Parsing…" : "Preview"}
          </Button>
          {committedId ? (
            <span className="text-sm text-positive">Import committed successfully.</span>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        ) : null}
      </div>

      {counts ? (
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive">
              {counts.new} new
            </Badge>
            <Badge variant="outline" className="border-accent bg-accent text-accent-foreground">
              {counts.updated} updated
            </Badge>
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {counts.unchanged} unchanged
            </Badge>
            {preview ? (
              <>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  {preview.counts.unmatchedVilla} unmatched villa
                </Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  {preview.counts.unmatchedChannel} unmatched channel
                </Badge>
              </>
            ) : null}
            {roomRevenuePreview ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                {roomRevenuePreview.counts.unmatchedReservation} unmatched reservation
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">
              {counts.errors} errors
            </Badge>
          </div>

          <div className="overflow-x-auto rounded-md border">
            {preview ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Reservation #</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Arrival</TableHead>
                    <TableHead>Departure</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedReservationRows.map((r: ResolvedRow) => (
                    <TableRow key={r.row.sourceRowNumber}>
                      <TableCell className="text-xs text-muted-foreground">{r.row.sourceRowNumber}</TableCell>
                      <TableCell className="font-medium">{r.row.reservationNumber || "—"}</TableCell>
                      <TableCell>{r.row.guestName ?? "—"}</TableCell>
                      <TableCell>
                        {r.channelUnknown ? (
                          <span className="text-amber-700">{r.row.channelRawName ?? "(blank)"} ?</span>
                        ) : (
                          r.row.channelRawName ?? "Direct"
                        )}
                      </TableCell>
                      <TableCell>
                        {r.villaUnknown ? (
                          <span className="text-amber-700">
                            {r.row.roomNumber || r.row.roomType || "—"} ?
                          </span>
                        ) : (
                          r.row.roomNumber || r.row.roomType || "—"
                        )}
                      </TableCell>
                      <TableCell>{r.row.arrivalDate ?? "—"}</TableCell>
                      <TableCell>{r.row.departureDate ?? "—"}</TableCell>
                      <TableCell>{r.row.status}</TableCell>
                      <TableCell>
                        <ActionBadge action={r.action} />
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {r.row.errors.length > 0
                          ? r.row.errors.join("; ")
                          : r.changeFlags.length > 0
                            ? r.changeFlags.join(", ")
                            : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Reservation #</TableHead>
                    <TableHead>Stay Date</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead className="text-right">Room Revenue</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRoomRevenueRows.map((r: ResolvedRoomRevenueRow) => (
                    <TableRow key={r.row.sourceRowNumber}>
                      <TableCell className="text-xs text-muted-foreground">{r.row.sourceRowNumber}</TableCell>
                      <TableCell className="font-medium">{r.row.reservationNumber || "—"}</TableCell>
                      <TableCell>{r.row.stayDate ?? "—"}</TableCell>
                      <TableCell>{r.row.roomNumber ?? "—"}</TableCell>
                      <TableCell>{r.row.guestName ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.row.commercialRevenueBasisAmount?.toLocaleString() ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={r.action} />
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {r.errorReason ?? (!r.reservationId && r.villaId ? "No matching reservation yet" : "")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {pageCount > 1 ? (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRows)} of {totalRows}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button onClick={handleCommit} disabled={committing}>
              {committing ? "Committing…" : commitLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
