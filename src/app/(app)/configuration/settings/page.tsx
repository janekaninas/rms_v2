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
import type { AppSetting } from "@/lib/types";
import { SettingFormDialog } from "./setting-form-dialog";
import { DeleteSettingButton } from "./delete-setting-button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const settings = await supabase
    .from("app_settings")
    .select("*")
    .order("key")
    .then(unwrap<AppSetting[]>);

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        actions={<SettingFormDialog trigger={<Button>Add Setting</Button>} />}
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-10" />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!settings || settings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No settings configured yet.
                </TableCell>
              </TableRow>
            ) : (
              (settings as AppSetting[]).map((s) => (
                <TableRow key={s.key}>
                  <TableCell className="font-mono text-xs">{s.key}</TableCell>
                  <TableCell>
                    {typeof s.value === "string" ? s.value : JSON.stringify(s.value)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <SettingFormDialog
                      setting={s}
                      trigger={
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <DeleteSettingButton settingKey={s.key} />
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
