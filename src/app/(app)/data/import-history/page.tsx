import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/unwrap";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ImportRow {
  id: string;
  import_type: string;
  filename: string;
  uploaded_at: string;
  row_count: number;
  new_count: number;
  updated_count: number;
  ignored_count: number;
  unmatched_count: number;
  error_count: number;
  status: string;
}

export default async function ImportHistoryPage() {
  const supabase = await createClient();
  const imports = await supabase
    .from("imports")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(200)
    .then(unwrap<ImportRow[]>);

  return (
    <div>
      <PageHeader eyebrow="Data" title="Import History" />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Uploaded</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Filename</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">New</TableHead>
              <TableHead className="text-right">Updated</TableHead>
              <TableHead className="text-right">Unchanged</TableHead>
              <TableHead className="text-right">Unmatched</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                  No imports yet.
                </TableCell>
              </TableRow>
            ) : (
              imports.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell className="text-xs">{new Date(imp.uploaded_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{imp.import_type}</TableCell>
                  <TableCell className="font-medium">{imp.filename}</TableCell>
                  <TableCell className="text-right">{imp.row_count}</TableCell>
                  <TableCell className="text-right">{imp.new_count}</TableCell>
                  <TableCell className="text-right">{imp.updated_count}</TableCell>
                  <TableCell className="text-right">{imp.ignored_count}</TableCell>
                  <TableCell className="text-right">{imp.unmatched_count}</TableCell>
                  <TableCell className="text-right">{imp.error_count}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        imp.status === "COMMITTED"
                          ? "border-positive/30 bg-positive/10 text-positive"
                          : imp.status === "FAILED"
                            ? "border-red-200 bg-red-50 text-red-600"
                            : "bg-muted text-muted-foreground"
                      }
                    >
                      {imp.status}
                    </Badge>
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
