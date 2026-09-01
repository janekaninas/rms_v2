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
import type { Channel, Villa, VillaGroup } from "@/lib/types";
import { RuleFormDialog } from "./rule-form-dialog";
import { ChannelFormDialog } from "./channel-form-dialog";
import { DeleteRuleButton } from "./delete-rule-button";

function formatPct(v: number | null) {
  if (v === null) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

export default async function ChannelPaymentRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const { channel: preselectChannelId } = await searchParams;
  const supabase = await createClient();

  const [rules, typedChannels, typedVillas, typedGroups] = await Promise.all([
    supabase
      .from("channel_payment_rules")
      .select("*, channels(display_name), villas(villa_code, name), villa_groups(name)")
      .order("effective_from", { ascending: false })
      .then(unwrap),
    supabase.from("channels").select("*").order("display_name").then(unwrap<Channel[]>),
    supabase.from("villas").select("*").order("villa_code").then(unwrap<Villa[]>),
    supabase.from("villa_groups").select("*").order("name").then(unwrap<VillaGroup[]>),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          eyebrow="Configuration"
          title="Channel Payment Rules"
          actions={
            <RuleFormDialog
              channels={typedChannels}
              villas={typedVillas}
              villaGroups={typedGroups}
              defaultChannelId={preselectChannelId}
            />
          }
        />

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Basis</TableHead>
                <TableHead>Payment Model</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rules || rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    No rules configured. An unresolved channel + villa + date combination raises{" "}
                    <code className="text-xs">MISSING_PAYMENT_RULE</code> — never a silent default.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.channels?.display_name}</TableCell>
                    <TableCell>
                      {r.villas ? (
                        <Badge variant="outline">{r.villas.villa_code}</Badge>
                      ) : r.villa_groups ? (
                        <Badge variant="outline" className="border-accent bg-accent text-accent-foreground">
                          {r.villa_groups.name} (group)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          Default
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.source_amount_basis}</TableCell>
                    <TableCell className="text-xs">{r.payment_model}</TableCell>
                    <TableCell className="text-right">{formatPct(r.commission_rate)}</TableCell>
                    <TableCell className="text-right">{formatPct(r.payment_service_fee_rate)}</TableCell>
                    <TableCell className="text-right">{formatPct(r.commission_vat_rate)}</TableCell>
                    <TableCell className="text-xs">
                      {r.effective_from} → {r.effective_to ?? "ongoing"}
                    </TableCell>
                    <TableCell>
                      <DeleteRuleButton id={r.id} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Channels</h2>
          <ChannelFormDialog />
        </div>
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Raw Name</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedChannels.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.raw_name}</TableCell>
                  <TableCell>{c.display_name}</TableCell>
                  <TableCell>{c.channel_type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
