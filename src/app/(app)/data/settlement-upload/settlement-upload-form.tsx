"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { Channel, SettlementColumnMapping, SettlementLineType } from "@/lib/types";
import type { SettlementImportPreview } from "@/lib/import/settlement-types";
import {
  inspectSettlementFileAction,
  getSavedMappingAction,
  saveMappingAction,
  previewSettlementAction,
  commitSettlementAction,
  commitManualEntryAction,
} from "./actions";

const LINE_TYPES: SettlementLineType[] = ["BOOKING_PAYOUT", "ADJUSTMENT", "REFUND", "CORRECTION", "FEE", "OTHER"];

const REQUIRED_FIELDS: { key: keyof SettlementColumnMapping; label: string }[] = [
  { key: "batchDate", label: "Batch / Payout Date" },
  { key: "reservationReference", label: "Reservation Reference" },
  { key: "amount", label: "Amount" },
];
const OPTIONAL_FIELDS: { key: keyof SettlementColumnMapping; label: string }[] = [
  { key: "batchReference", label: "Batch / Payout Reference" },
  { key: "lineType", label: "Line Type" },
  { key: "description", label: "Description" },
  { key: "externalLineRef", label: "External Line Ref (for idempotent re-upload)" },
];

function MatchBadge({ outcome }: { outcome: string }) {
  if (outcome === "MATCHED") return <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive">Matched</Badge>;
  if (outcome === "AMBIGUOUS") return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Ambiguous</Badge>;
  if (outcome === "UNMATCHED") return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">Unmatched</Badge>;
  return <Badge variant="outline" className="bg-muted text-muted-foreground">N/A</Badge>;
}

export function SettlementUploadForm({ channels }: { channels: Channel[] }) {
  const [channelId, setChannelId] = useState<string>(channels[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<Partial<SettlementColumnMapping>>({});
  const [preview, setPreview] = useState<SettlementImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committedIds, setCommittedIds] = useState<string[] | null>(null);

  async function handleSelectFile(f: File | null) {
    setFile(f);
    setHeaders(null);
    setPreview(null);
    setCommittedIds(null);
    setError(null);
    if (!f || !channelId) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const [inspected, savedMapping] = await Promise.all([
        inspectSettlementFileAction(fd),
        getSavedMappingAction(channelId),
      ]);
      setHeaders(inspected.headers);
      if (savedMapping) setMapping(savedMapping);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function isMappingComplete(m: Partial<SettlementColumnMapping>): m is SettlementColumnMapping {
    return Boolean(m.batchDate && m.reservationReference && m.amount);
  }

  async function handlePreview() {
    if (!file || !isMappingComplete(mapping)) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const p = await previewSettlementAction(channelId, mapping, fd);
      setPreview(p);
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveMapping() {
    if (!isMappingComplete(mapping)) return;
    try {
      await saveMappingAction(channelId, mapping);
      toast.success("Mapping saved for this channel — reused automatically next time.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleCommit() {
    if (!preview || !file) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await commitSettlementAction(file.name, preview);
      setCommittedIds(result.batchIds);
      toast.success(`Committed ${result.batchIds.length} settlement batch(es).`);
      setPreview(null);
      setFile(null);
      setHeaders(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  const lineErrorCount = preview?.batches.reduce((s, b) => s + b.lines.filter((l) => l.line.errors.length > 0).length, 0) ?? 0;

  return (
    <Tabs defaultValue="file">
      <TabsList>
        <TabsTrigger value="file">Upload File</TabsTrigger>
        <TabsTrigger value="manual">Manual Entry</TabsTrigger>
      </TabsList>

      <TabsContent value="file" className="space-y-6">
        <div className="rounded-lg border bg-card p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="channel">Channel</Label>
              <Select
                value={channelId}
                onValueChange={(v) => {
                  setChannelId(v);
                  setFile(null);
                  setHeaders(null);
                  setPreview(null);
                  setMapping({});
                }}
              >
                <SelectTrigger id="channel" className="w-full">
                  <SelectValue />
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
              <Label htmlFor="file">Settlement File (CSV)</Label>
              <input
                id="file"
                type="file"
                accept=".csv"
                onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
              />
            </div>
          </div>

          {!headers && (
            <p className="mt-3 text-xs text-muted-foreground">
              The real Airbnb/Booking.com/Expedia export layouts have not been supplied yet
              (FINANCIAL_LOGIC.md §10 item 19) — map any CSV&apos;s columns below after picking a
              file; nothing is hardcoded per OTA.
            </p>
          )}

          {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
        </div>

        {headers ? (
          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-3 text-sm font-medium">Column mapping</h3>
            <div className="grid grid-cols-2 gap-4">
              {REQUIRED_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label>{f.label} *</Label>
                  <Select
                    value={mapping[f.key] ?? ""}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose column…" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {OPTIONAL_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label>{f.label}</Label>
                  <Select
                    value={mapping[f.key] ?? "__none__"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? undefined : v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="(none)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(none)</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button onClick={handlePreview} disabled={!isMappingComplete(mapping) || loading}>
                {loading ? "Parsing…" : "Preview"}
              </Button>
              <Button variant="outline" onClick={handleSaveMapping} disabled={!isMappingComplete(mapping)}>
                Save mapping for this channel
              </Button>
              {committedIds ? (
                <span className="text-sm text-positive">
                  Committed {committedIds.length} batch(es) successfully.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {preview ? (
          <div className="rounded-lg border bg-card p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive">
                {preview.counts.matched} matched
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                {preview.counts.ambiguous} ambiguous
              </Badge>
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">
                {preview.counts.unmatched} unmatched
              </Badge>
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                {lineErrorCount} row error(s)
              </Badge>
            </div>

            {preview.batches.map((b, i) => (
              <div key={i} className="mb-6 rounded-md border">
                <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-sm">
                  <span>
                    Batch {b.batchReference ?? "(whole file)"} — {b.batchDate} — {b.lines.length} line(s)
                    {b.isDuplicateOfExistingBatch ? (
                      <Badge variant="outline" className="ml-2 border-amber-200 bg-amber-50 text-amber-700">
                        Already imported — will be skipped
                      </Badge>
                    ) : null}
                  </span>
                  <span className="font-medium">
                    Net: {b.netAmount.toLocaleString()} (Gross {b.grossAmount.toLocaleString()}, Adj{" "}
                    {b.adjustmentAmount.toLocaleString()})
                  </span>
                </div>
                <div className="max-h-72 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reservation Ref</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {b.lines.map((rl) => (
                        <TableRow key={rl.line.sourceRowNumber}>
                          <TableCell className="text-xs text-muted-foreground">{rl.line.sourceRowNumber}</TableCell>
                          <TableCell>{rl.line.lineType}</TableCell>
                          <TableCell>{rl.line.rawReservationReference ?? "—"}</TableCell>
                          <TableCell className="text-right">{rl.line.amount?.toLocaleString() ?? "—"}</TableCell>
                          <TableCell>
                            <MatchBadge outcome={rl.matchOutcome} />
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                            {rl.line.errors.join("; ") ||
                              (rl.matchOutcome === "AMBIGUOUS" ? `${rl.matchCandidateCount} candidates` : "")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}

            <div className="flex justify-end">
              <Button onClick={handleCommit} disabled={committing}>
                {committing ? "Committing…" : "Commit"}
              </Button>
            </div>
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="manual">
        <ManualEntryForm channels={channels} defaultChannelId={channelId} />
      </TabsContent>
    </Tabs>
  );
}

interface ManualLine {
  lineType: SettlementLineType;
  rawReservationReference: string;
  amount: string;
  description: string;
}

function ManualEntryForm({ channels, defaultChannelId }: { channels: Channel[]; defaultChannelId: string }) {
  const [channelId, setChannelId] = useState(defaultChannelId);
  const [batchReference, setBatchReference] = useState("");
  const [batchDate, setBatchDate] = useState("");
  const [lines, setLines] = useState<ManualLine[]>([
    { lineType: "BOOKING_PAYOUT", rawReservationReference: "", amount: "", description: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(i: number, patch: Partial<ManualLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit() {
    setError(null);
    if (!channelId || !batchDate) {
      setError("Channel and batch date are required.");
      return;
    }
    const parsedLines = lines
      .filter((l) => l.amount.trim() !== "")
      .map((l) => ({
        lineType: l.lineType,
        rawReservationReference: l.rawReservationReference.trim() || null,
        amount: Number(l.amount),
        description: l.description.trim() || null,
        externalLineRef: null,
      }));
    if (parsedLines.length === 0) {
      setError("Add at least one line with an amount.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await commitManualEntryAction({
        channelId,
        batchReference: batchReference.trim() || null,
        batchDate,
        lines: parsedLines,
      });
      toast.success(`Manual settlement batch recorded (${result.batchIds.length}).`);
      setBatchReference("");
      setBatchDate("");
      setLines([{ lineType: "BOOKING_PAYOUT", rawReservationReference: "", amount: "", description: "" }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6">
      <p className="text-xs text-muted-foreground">
        For an exceptional settlement that doesn&apos;t come as a file — a one-off correction or a
        channel with no bulk export (IMPORT_LOGIC.md §8 pt.7). Goes through the same
        reconciliation model as a file import.
      </p>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Channel</Label>
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger className="w-full">
              <SelectValue />
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
          <Label>Batch / Payout Reference</Label>
          <Input value={batchReference} onChange={(e) => setBatchReference(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label>Batch Date</Label>
          <Input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Lines</Label>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[140px_1fr_140px_1fr_auto] items-start gap-2">
            <Select value={l.lineType} onValueChange={(v) => updateLine(i, { lineType: v as SettlementLineType })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Reservation reference"
              value={l.rawReservationReference}
              onChange={(e) => updateLine(i, { rawReservationReference: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Amount"
              value={l.amount}
              onChange={(e) => updateLine(i, { amount: e.target.value })}
            />
            <Textarea
              placeholder="Description"
              value={l.description}
              onChange={(e) => updateLine(i, { description: e.target.value })}
              className="h-9 min-h-9 resize-none"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
              disabled={lines.length === 1}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setLines((ls) => [...ls, { lineType: "BOOKING_PAYOUT", rawReservationReference: "", amount: "", description: "" }])
          }
        >
          + Add line
        </Button>
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Recording…" : "Record settlement batch"}
        </Button>
      </div>
    </div>
  );
}
