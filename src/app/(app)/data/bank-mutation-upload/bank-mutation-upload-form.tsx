"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BankAccount } from "@/lib/types";
import type { BankMutationImportPreview } from "@/lib/import/resolve-bank-mutation";
import { previewBankMutationAction, commitBankMutationAction } from "./actions";

function fmt(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function BankMutationUploadForm({ bankAccounts }: { bankAccounts: BankAccount[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BankMutationImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ insertedCount: number; skippedAlreadyImportedCount: number; skippedUnrecognizedAccountCount: number } | null>(null);

  async function handleSelectFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setCommitted(null);
    setError(null);
    if (!f) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const p = await previewBankMutationAction(fd);
      setPreview(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!preview || !file) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await commitBankMutationAction(file.name, preview);
      setCommitted(result);
      toast.success(`Committed ${result.insertedCount} new bank transaction(s).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-1.5">
          <Label htmlFor="file">BCA statement export (.docx)</Label>
          <input
            id="file"
            type="file"
            accept=".docx"
            onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Confirmed against real BCA &quot;Mutasi Rekening&quot; exports (IMPORT_LOGIC.md §9). Configured accounts:{" "}
          {bankAccounts.length === 0
            ? "none yet"
            : bankAccounts.map((a) => `${a.bank_name} ${a.account_number_masked} (${a.account_name})`).join(", ")}
          . A statement section for an account not listed here is parsed and shown, but never committed — configure that
          account first.
        </p>
        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
        {loading ? <p className="mt-3 text-sm text-muted-foreground">Parsing…</p> : null}
      </div>

      {preview
        ? preview.sections.map((s, i) => {
            const newRows = s.rows.filter((r) => !r.alreadyImported);
            const alreadyImportedCount = s.rows.length - newRows.length;
            return (
              <div key={i} className="rounded-lg border bg-card p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">
                      {s.accountNumber} — {s.accountName}
                    </span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {s.periodStart} → {s.periodEnd}
                    </span>
                  </div>
                  {s.bankAccountId ? (
                    <Badge variant="outline" className="border-positive/30 bg-positive/10 text-positive">
                      Configured account
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      Unrecognized account — not imported
                    </Badge>
                  )}
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    {newRows.length} new
                  </Badge>
                  {alreadyImportedCount > 0 ? (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      {alreadyImportedCount} already imported
                    </Badge>
                  ) : null}
                  {s.pendingSkippedCount > 0 ? (
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                      {s.pendingSkippedCount} pending (not yet posted — skipped, arrives dated next statement)
                    </Badge>
                  ) : null}
                </div>

                {s.totalMismatch ? (
                  <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                    Declared totals don&apos;t match parsed rows — Credit: declared {s.declaredCreditTotal !== null ? fmt(s.declaredCreditTotal) : "—"} vs.
                    parsed {fmt(s.parsedCreditTotal)}; Debit: declared {s.declaredDebitTotal !== null ? fmt(s.declaredDebitTotal) : "—"} vs. parsed{" "}
                    {fmt(s.parsedDebitTotal)}.
                  </p>
                ) : null}

                <div className="max-h-72 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.rows.map((r, ri) => (
                        <TableRow key={ri}>
                          <TableCell className="text-xs">{r.transactionDate}</TableCell>
                          <TableCell className="max-w-md truncate text-xs">{r.description}</TableCell>
                          <TableCell className="text-right text-xs">{fmt(r.amount)}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {r.runningBalance !== null ? fmt(r.runningBalance) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.alreadyImported ? <span className="text-amber-700">Already imported</span> : <span className="text-muted-foreground">New</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })
        : null}

      {preview ? (
        <div className="flex items-center gap-3">
          <Button onClick={handleCommit} disabled={committing}>
            {committing ? "Committing…" : "Commit"}
          </Button>
          {committed ? (
            <span className="text-sm text-positive">
              {committed.insertedCount} new transaction(s) committed
              {committed.skippedAlreadyImportedCount > 0 ? `, ${committed.skippedAlreadyImportedCount} already-imported skipped` : ""}
              {committed.skippedUnrecognizedAccountCount > 0 ? `, ${committed.skippedUnrecognizedAccountCount} from an unrecognized account skipped` : ""}.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
