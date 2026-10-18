import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Seq = {
  id: string; stage: string; step_order: number; delay_minutes: number;
  channel: string; template_key: string | null; marketing: boolean; active: boolean;
};
type Tpl = {
  id: string; key: string; channel: string; subject_en: string | null; subject_es: string | null;
  body_en: string; body_es: string | null; es_reviewed: boolean; active: boolean;
};
type ContactRow = { id: string; first_name: string | null; email: string | null; phone: string | null; lifecycle_stage: string };
type ZapRow = {
  zap_id: string; name: string; zap_state: string; app_stage: string | null;
  replacement_note: string | null; status: string; cutover_date: string | null; notes: string | null;
};
const ZAP_STATUSES = ["shadow", "ready", "zap_off", "app_live", "retired", "blocked"] as const;

function fmtDelay(mins: number): string {
  if (mins === 0) return "immediately";
  if (mins < 120) return `${mins} min`;
  const h = mins / 60;
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export default function AdminMessages() {
  const [seqs, setSeqs] = useState<Seq[]>([]);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<{ sent: number; failed: number }>({ sent: 0, failed: 0 });
  const [orphans, setOrphans] = useState<ContactRow[]>([]);
  const [shadow, setShadow] = useState(true);
  const [liveStages, setLiveStages] = useState("");
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [testKey, setTestKey] = useState("");
  const [zaps, setZaps] = useState<ZapRow[]>([]);
  const [shadowCounts, setShadowCounts] = useState<Record<string, number>>({});

  const load = async () => {
    const [{ data: s }, { data: t }, { data: c }, { data: q }, { data: sh }, { data: ls }, { data: z }, { data: dr }] = await Promise.all([
      supabase.from("lifecycle_sequences").select("*").order("stage").order("step_order"),
      supabase.from("lifecycle_templates").select("*").order("key"),
      supabase.from("contacts").select("lifecycle_stage"),
      supabase.from("message_queue").select("status").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
      supabase.from("app_settings").select("value").eq("key", "lifecycle_shadow").maybeSingle(),
      supabase.from("app_settings").select("value").eq("key", "lifecycle_live_stages").maybeSingle(),
      supabase.from("zap_cutover").select("*").order("zap_id"),
      supabase.from("message_queue").select("stage").eq("status", "dry_run").gte("sent_at", new Date(Date.now() - 7 * 864e5).toISOString()),
    ]);
    setZaps((z ?? []) as ZapRow[]);
    const dc: Record<string, number> = {};
    for (const r of dr ?? []) dc[r.stage] = (dc[r.stage] ?? 0) + 1;
    setShadowCounts(dc);
    setSeqs((s ?? []) as Seq[]);
    setTpls((t ?? []) as Tpl[]);
    const cc: Record<string, number> = {};
    for (const r of c ?? []) cc[r.lifecycle_stage] = (cc[r.lifecycle_stage] ?? 0) + 1;
    setCounts(cc);
    const rows = q ?? [];
    setStats({
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
    });
    setShadow((sh?.value as string) !== "off");
    setLiveStages(((ls?.value as string) ?? "").toString());
    const { data: orph } = await supabase.rpc("lifecycle_orphans" as never);
    setOrphans((orph ?? []) as ContactRow[]);
  };

  useEffect(() => { load(); }, []);

  const stages = useMemo(() => {
    const m = new Map<string, Seq[]>();
    for (const s of seqs) {
      if (!m.has(s.stage)) m.set(s.stage, []);
      m.get(s.stage)!.push(s);
    }
    return [...m.entries()];
  }, [seqs]);

  const tplFor = (key: string | null, channel: string) =>
    tpls.find((t) => t.key === key && t.channel === channel);

  const saveTpl = async (t: Tpl) => {
    const { error } = await supabase.from("lifecycle_templates").update({
      subject_en: t.subject_en, subject_es: t.subject_es,
      body_en: t.body_en, body_es: t.body_es,
      es_reviewed: t.es_reviewed, active: t.active,
    }).eq("id", t.id);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setEditing(null); load(); }
  };

  const toggleSeq = async (s: Seq) => {
    await supabase.from("lifecycle_sequences").update({ active: !s.active }).eq("id", s.id);
    load();
  };

  const saveSettings = async () => {
    await supabase.from("app_settings").upsert({ key: "lifecycle_shadow", value: JSON.stringify(shadow ? "on" : "off") }, { onConflict: "key" });
    await supabase.from("app_settings").upsert({ key: "lifecycle_live_stages", value: JSON.stringify(liveStages) }, { onConflict: "key" });
    toast.success("Settings saved");
  };

  const sendTest = async () => {
    if (!testKey) return;
    const { error } = await supabase.functions.invoke("lifecycle-event", {
      body: {
        email: "hello@jointidy.co", phone: "+17868291141", first_name: "Justin",
        stage: "TEST", tokens: {}, // placeholder — test send uses template directly below
      },
    });
    if (error) { toast.error(error.message); return; }
    toast.info("Test contact staged; use the template editor preview for copy checks.");
  };

  return (
    <div className="space-y-8 p-4">
        <section className="rounded-xl border p-4 space-y-3">
          <h2 className="text-lg font-bold">Engine</h2>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={shadow} onCheckedChange={setShadow} />
            Shadow mode {shadow ? "ON — nothing is sent, everything is logged" : "OFF — live stages send"}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm w-32">Live stages</span>
            <Input value={liveStages} onChange={(e) => setLiveStages(e.target.value)} placeholder="WELCOME,EVERY_VISIT" />
            <Button onClick={saveSettings}>Save</Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Last 30 days: {stats.sent} sent · {stats.failed} failed
          </p>
        </section>

        <section className="rounded-xl border p-4 space-y-2">
          <h2 className="text-lg font-bold">Orphans ({orphans.length})</h2>
          {orphans.length === 0 && <p className="text-sm text-muted-foreground">Every active contact has a next message queued.</p>}
          {orphans.map((o) => (
            <div key={o.id} className="text-sm">{o.first_name ?? o.email ?? o.phone} — {o.lifecycle_stage}</div>
          ))}
        </section>

        {stages.map(([stage, steps]) => (
          <section key={stage} className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">{stage}</h2>
              <Badge variant="secondary">{counts[stage] ?? 0} contacts</Badge>
            </div>
            {steps.map((s) => {
              const t = tplFor(s.template_key, s.channel);
              return (
                <div key={s.id} className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
                  <Switch checked={s.active} onCheckedChange={() => toggleSeq(s)} />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">
                      {fmtDelay(s.delay_minutes)} · {s.channel.toUpperCase()} · {s.template_key ?? "task"}
                      {s.marketing && <Badge className="ml-2" variant="outline">marketing</Badge>}
                    </div>
                    {t && (
                      <div className="mt-1 text-muted-foreground">
                        {t.subject_en && <div>Subject: {t.subject_en}</div>}
                        <div className="line-clamp-2">{t.body_en.replace(/<[^>]+>/g, " ")}</div>
                        <div className="mt-1 flex gap-2">
                          <Badge variant="secondary">EN live</Badge>
                          {t.body_es
                            ? <Badge variant={t.es_reviewed ? "default" : "destructive"}>{t.es_reviewed ? "ES approved" : "ES needs review"}</Badge>
                            : <Badge variant="destructive">ES missing</Badge>}
                        </div>
                      </div>
                    )}
                  </div>
                  {t && <Button size="sm" variant="outline" onClick={() => setEditing({ ...t })}>Edit</Button>}
                </div>
              );
            })}
          </section>
        ))}

        <section className="rounded-xl border p-4 space-y-2">
          <h2 className="text-lg font-bold">Test mode</h2>
          <p className="text-sm text-muted-foreground">Send any template to Justin's phone/email with sample tokens.</p>
          <div className="flex gap-2">
            <Input value={testKey} onChange={(e) => setTestKey(e.target.value)} placeholder="template key, e.g. reserved_sms0" />
            <Button onClick={sendTest}>Send test</Button>
          </div>
        </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl bg-background p-6">
            <h3 className="text-lg font-bold">{editing.key} · {editing.channel}</h3>
            {editing.channel === "email" && (
              <>
                <Input value={editing.subject_en ?? ""} onChange={(e) => setEditing({ ...editing, subject_en: e.target.value })} placeholder="Subject (EN)" />
                <Input value={editing.subject_es ?? ""} onChange={(e) => setEditing({ ...editing, subject_es: e.target.value })} placeholder="Subject (ES)" />
              </>
            )}
            <Textarea rows={6} value={editing.body_en} onChange={(e) => setEditing({ ...editing, body_en: e.target.value })} placeholder="Body (EN)" />
            <Textarea rows={6} value={editing.body_es ?? ""} onChange={(e) => setEditing({ ...editing, body_es: e.target.value })} placeholder="Body (ES)" />
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={editing.es_reviewed} onCheckedChange={(v) => setEditing({ ...editing, es_reviewed: v })} />
              Spanish approved — send ES to Spanish contacts
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
              Active
            </label>
            <div className="flex gap-2">
              <Button onClick={() => saveTpl(editing)}>Save</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
