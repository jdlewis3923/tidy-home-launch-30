/**
 * /admin/social — the social calendar, tied to launch_config.
 * Every post is a template; {LAUNCH}, {CONVERT} and {CAR_LINE} are filled on
 * the day it posts. The planner (social-plan) places posts from the launch
 * dates, nightly and whenever a launch date changes. Posted rows never move.
 * Facebook + Instagram publish through the confirmed platform ledger.
 * Platforms without direct connections remain held.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { useLaunchConfig } from "@/hooks/useLaunchConfig";
import { Button } from "@/components/ui/button";
import { renderTemplate, instagramVersion, etDate, type PlanAnchors, type PlanResult } from "@/lib/socialPlanner";

type Post = {
  id: string; post_number: number | null; channel: string; scheduled_for: string | null; caption: string | null; template_copy: string | null;
  image_url: string | null; image_hash: string | null; image_subject: string | null; image_flag: string | null; status: string; posted_at: string | null; external_post_id: string | null;
  media_kind?: string; source_key?: string | null; content_hash: string | null; publish_error: string | null; waiting_reason: string | null; priority: number | null; is_spare: boolean;
};
const CH: Record<string, string> = { meta_combined: "Facebook + Instagram", instagram: "Instagram", facebook: "Facebook", nextdoor: "Nextdoor", linkedin: "LinkedIn" };
const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const monthKey = (iso: string) => etDate(iso).slice(0, 7);
const label = (p: Post) => (p.is_spare ? `Spare S${(p.post_number ?? 100) - 100}` : `#${String(p.post_number ?? "").padStart(2, "0")}`);

export default function AdminSocial() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const cfg = useLaunchConfig();
  const [params] = useSearchParams();
  const focus = params.get("post");
  const [posts, setPosts] = useState<Post[]>([]);
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [pv, setPv] = useState({ launch: "", conversion: "", car: "" });
  const [preview, setPreview] = useState<PlanResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<'fortnight' | 'month'>('fortnight');
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [dryRun, setDryRun] = useState<Array<{ source_id: string; scheduled_for: string; caption: string; image_url: string; result: { ok: boolean; reason?: string } }> | null>(null);
  const [platformFilter,setPlatformFilter]=useState('all');
  const [receipts,setReceipts]=useState<Array<{post_id:string;webhook_status:number|null;webhook_response:string|null;post_url:string|null;state:string}>>([]);
  const [linkedinReady, setLinkedinReady] = useState<boolean | null>(null);

  const anchors: PlanAnchors = useMemo(() => ({
    launch: cfg?.cleaning?.first_visit_date ?? null, conversion: cfg?.cleaning?.conversion_date ?? null, carLaunch: cfg?.car?.first_visit_date ?? null,
    hangerDrop1: (cfg?.global?.hanger_drops ?? []).map((d) => d.start).sort()[0] ?? null,
  }), [cfg]);
  useEffect(() => { setPv({ launch: anchors.launch ?? "", conversion: anchors.conversion ?? "", car: anchors.carLaunch ?? "" }); }, [anchors]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("social_launch_posts")
      .select("id, post_number, channel, scheduled_for, caption, template_copy, image_url, image_hash, image_subject, image_flag, status, posted_at, external_post_id, content_hash, publish_error, waiting_reason, priority, is_spare, media_kind, source_key")
      .eq('is_test', false).is("archived_at", null).order("scheduled_for", { nullsFirst: false });
    setPosts((data ?? []) as Post[]);
    const {data:ledger}=await supabase.from('social_publish_ledger').select('post_id,webhook_status,webhook_response,post_url,state').eq('platform','linkedin').eq('is_test',false).order('created_at',{ascending:false});
    setReceipts(ledger??[]);
  }, []);
  useEffect(() => { if (hasRole) void load(); }, [hasRole, load]);
  useEffect(() => {
    if (!hasRole) return;
    supabase.functions.invoke('social-launch-publisher', { body: { action: 'status' } })
      .then(({ data }) => setLinkedinReady(!!data?.linkedin_configured))
      .catch(() => setLinkedinReady(null));
  }, [hasRole]);
  useEffect(() => {
    const p = posts.find((x) => x.id === focus);
    if (p?.scheduled_for) { setMonth(monthKey(p.scheduled_for)); setRange('month'); setTimeout(() => document.getElementById(`post-${p.id}-${p.channel === 'meta_combined' ? 'facebook' : p.channel}`)?.scrollIntoView({ block: "center" }), 50); }
  }, [focus, posts]);

  const placed = posts.filter((p) => p.scheduled_for);
  const waiting = posts.filter((p) => !p.scheduled_for && !p.posted_at && !(p.is_spare && p.waiting_reason === "Spare not needed"));
  const months = useMemo(() => [...new Set(placed.flatMap((p) => p.scheduled_for ? [monthKey(p.scheduled_for)] : []))], [placed]);

  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Loading…</main>;
  if (!hasRole) return <Navigate to="/login" replace />;

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("social-plan", { body });
    if (error) throw error;
    return data;
  };
  const save = async (p: Post) => {
    const copy = edit[p.id] ?? p.template_copy ?? p.caption ?? "";
    const { error } = await supabase.from("social_launch_posts").update({ caption: copy, template_copy: copy }).eq("id", p.id);
    if (error) { toast.error(error.message.replace(/^.*?: /, "")); return; }
    toast.success("Saved"); void load();
  };
  const replaceImage = async (p: Post, file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const path = `locked/${p.id}/${crypto.randomUUID()}.${file.type === 'image/jpeg' ? 'jpg' : 'png'}`;
      const { error: uploadError } = await supabase.storage.from('social-images').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('social-images').getPublicUrl(path);
      const { error } = await supabase.from('social_launch_posts').update({ image_url: data.publicUrl, image_flag: null, status: 'scheduled', publish_error: null }).eq('id', p.id);
      if (error) throw error;
      const { error: auditError } = await supabase.functions.invoke('social-launch-publisher', { body: { action: 'audit' } });
      if (auditError) throw auditError;
      toast.success('Image saved'); await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const movePost = async (p: Post) => {
    const date = moves[p.id]; if (!date) return;
    const targets = p.channel === 'meta_combined' ? ['facebook', 'instagram'] : [p.channel];
    if (posts.some(o => o.id !== p.id && o.scheduled_for && Date.parse(o.scheduled_for) === Date.parse(date) && (o.channel === 'meta_combined' ? ['facebook', 'instagram'] : [o.channel]).some(c => targets.includes(c)))) { toast.error('That platform already has a post in this slot'); return; }
    const { error } = await supabase.from('social_launch_posts').update({ scheduled_for: new Date(date).toISOString(), manual_schedule: true, status: 'scheduled', publish_error: null }).eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Post rescheduled'); void load();
  };
  const runDry = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('social-launch-publisher', { body: { action: 'dry_run' } });
      if (error) throw error;
      setDryRun(data.timeline); toast.success('Dry-run complete — nothing sent');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const markPosted = async (p: Post) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('admin_mark_social_posted', { _id: p.id });
      if (error) throw error;
      toast.success('Marked posted'); await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const copyCaption = async (p: Post) => {
    const day = p.scheduled_for ? etDate(p.scheduled_for) : new Date().toISOString().slice(0, 10);
    await navigator.clipboard.writeText(renderTemplate(edit[p.id] ?? p.template_copy ?? p.caption ?? '', anchors, day));
    toast.success('Caption copied');
  };
  const runPreview = async () => {
    setBusy(true);
    try { const r = await invoke({ action: "preview", anchors: { launch: pv.launch || null, conversion: pv.conversion || null, carLaunch: pv.car || null } }); setPreview(r.plan); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const sets: [string, string, string][] = [];
      if (pv.launch !== (anchors.launch ?? "")) sets.push(["cleaning", "first_visit_date", pv.launch], ["lawn", "first_visit_date", pv.launch]);
      if (pv.conversion !== (anchors.conversion ?? "")) sets.push(["cleaning", "conversion_date", pv.conversion], ["lawn", "conversion_date", pv.conversion]);
      if (pv.car !== (anchors.carLaunch ?? "")) { toast.error("Car care dates are set only by approving the car launch on Launch dates."); return; }
      for (const [s, f, v] of sets) {
        const { error } = await supabase.rpc("admin_set_launch_config", { _scope: s, _field: f, _value: v });
        if (error) throw error;
      }
      await invoke({ action: "plan" });
      toast.success("Launch dates saved and calendar re-planned"); setPreview(null); void load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const byId = new Map(posts.map((p) => [p.id, p]));
  const now = Date.now();
  const shown = placed.filter((p) => p.scheduled_for && (range === 'fortnight' ? etDate(p.scheduled_for) >= etDate(new Date(now).toISOString()) && Date.parse(p.scheduled_for) < now + 14 * 86400000 : monthKey(p.scheduled_for) === month));
  const card = (p: Post, platform = p.channel) => {
    const tpl = edit[p.id] ?? p.template_copy ?? p.caption ?? "";
    const day = p.scheduled_for ? etDate(p.scheduled_for) : new Date().toISOString().slice(0, 10);
    const rendered = renderTemplate(tpl, anchors, day);
    const locked = p.status === "posted" || p.status === "posting" || !!p.external_post_id || receipts.some(r=>r.post_id===p.id);
    const receipt=receipts.find(r=>r.post_id===p.id);
    const blocked = !!p.image_flag || (!p.image_url && p.media_kind!=='text') || p.status === 'blocked' || p.status === 'missed';
    return (
      <section key={`${p.id}-${platform}`} id={`post-${p.id}-${platform}`} className={`rounded-lg border p-4 ${blocked ? 'border-destructive' : focus === p.id ? "border-primary" : "border-border"} bg-card`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-bold text-foreground">{label(p)} · {p.scheduled_for ? fmt(p.scheduled_for) : p.waiting_reason ?? "Waiting"} · {CH[platform] ?? platform}</p>
          <div className="flex gap-2">
            {p.image_flag && <span className="rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold text-destructive-foreground">Needs image</span>}
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">{p.status}</span>
          </div>
        </div>
        {p.image_flag && <p className="mt-1 text-xs text-destructive">{p.image_flag}</p>}
        {receipt && <div className="mt-2 text-xs text-muted-foreground"><p>{receipt.state==='posted'?'Confirmed on LinkedIn':receipt.webhook_status!==null && receipt.webhook_status>=400?'Rejected by Zapier':'Awaiting LinkedIn confirmation'} · Zapier HTTP {receipt.webhook_status??'pending'}</p><pre className="whitespace-pre-wrap">{receipt.webhook_response}</pre>{receipt.post_url && <a href={receipt.post_url} target="_blank" rel="noreferrer" className="text-primary underline">Open LinkedIn post</a>}</div>}
        {p.publish_error && <p className="mt-1 text-xs text-destructive">{p.publish_error}</p>}
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_240px]">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Template</p>
            <textarea rows={7} disabled={locked} value={tpl} onChange={(ev) => setEdit({ ...edit, [p.id]: ev.target.value })} className="w-full rounded border border-input bg-background p-2 text-sm" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{CH[platform] ?? platform}</p>
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs text-foreground">{platform === 'instagram' ? instagramVersion(rendered) : rendered}</pre>
          </div>
          <div>{p.image_url ? <img src={p.image_url} alt={p.image_subject??"Post image"} width={1200} height={p.media_kind==='banner'?627:1200} className="h-auto w-full rounded object-contain" /> : <div className="flex h-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">{p.media_kind==='text'?'Text only':'No image'}</div>}
            <details className="mt-1 text-[11px] text-muted-foreground"><summary>Image details</summary>{p.image_subject}</details></div>
        </div>
        {!locked && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void save(p)}>Save copy</Button>
            {p.channel === 'nextdoor' && (
              <>
                <Button size="sm" variant="outline" onClick={() => void copyCaption(p)}>Copy caption</Button>
                {p.image_url && <a href={p.image_url} download target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">Download image</a>}
                <Button size="sm" onClick={() => void markPosted(p)} disabled={busy}>Mark posted</Button>
              </>
            )}
            <label className="text-xs text-muted-foreground">Replace image<input aria-label={`Replace image ${label(p)} ${platform}`} type="file" accept="image/jpeg,image/png" disabled={busy} onChange={e => void replaceImage(p, e.target.files?.[0])} className="block max-w-60" /></label>
            <label className="text-xs text-muted-foreground">New time (your local time)<input aria-label={`New time ${label(p)} ${platform}`} type="datetime-local" value={moves[p.id] ?? ''} onChange={e => setMoves({ ...moves, [p.id]: e.target.value })} className="block rounded border border-input bg-background p-1.5 text-foreground" /></label>
            <Button size="sm" variant="outline" onClick={() => void movePost(p)} disabled={!moves[p.id]}>Move post</Button>
          </div>
        )}
      </section>
    );
  };

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <header>
        <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Social calendar</h1>
        {receipts.some(r=>r.webhook_status!==null && r.webhook_status>=400) && <p className="mt-2 border border-destructive bg-destructive/10 p-3 text-sm text-destructive">LinkedIn calendar held: Zapier rejected a post. Confirm the Zap supports both image and text posts before rescheduling. Accepted posts will not be resent.</p>}
        <div className="mt-3 flex flex-wrap gap-2"><Button variant={range === 'fortnight' ? 'default' : 'outline'} onClick={() => setRange('fortnight')}>Next 14 days</Button><Button variant={range === 'month' ? 'default' : 'outline'} onClick={() => setRange('month')}>All months</Button><Button variant="outline" onClick={() => void runDry()} disabled={busy}>Run publishing dry-run</Button></div>
        <div className="mt-3 flex gap-2"><Button variant={platformFilter==='all'?'default':'outline'} onClick={()=>setPlatformFilter('all')}>All platforms</Button><Button variant={platformFilter==='linkedin'?'default':'outline'} onClick={()=>setPlatformFilter('linkedin')}>LinkedIn</Button></div>
        <p className="mt-2 text-sm text-muted-foreground">Facebook, Instagram and LinkedIn publish automatically from here. Nextdoor is manual: copy the caption, download the image, post it, then mark it posted.</p>
        {linkedinReady === false && (
          <p className="mt-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            LinkedIn isn't connected — add the LINKEDIN_ZAP_WEBHOOK_URL secret (Zapier catch hook → LinkedIn company page), or LinkedIn posts will be blocked.
          </p>
        )}
      </header>
      {dryRun && <section className="space-y-3"><h2 className="text-xl font-bold">Dry-run timeline</h2>{dryRun.map((r, i) => <div key={`${r.source_id}-${i}`} className={`flex gap-4 border-b border-border py-3 ${r.result.ok ? 'text-foreground' : 'text-destructive'}`}><img src={r.image_url} alt="" className="h-24 w-24 object-contain" /><div className="min-w-0"><p>{fmt(r.scheduled_for)} · {r.result.ok ? 'Would publish' : r.result.reason}</p><pre className="whitespace-pre-wrap text-xs">{r.caption}</pre></div></div>)}</section>}

      <section className="rounded-xl border border-border bg-card p-4" data-testid="social-preview-box">
        <h2 className="font-bold text-foreground">Preview another launch date</h2>
        <p className="text-xs text-muted-foreground">Nothing is saved until you press Apply. Apply writes your launch dates, which re-plans the calendar.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">First visits (cleaning + lawn)<input type="date" value={pv.launch} onChange={(e) => setPv({ ...pv, launch: e.target.value })} className="rounded border border-input bg-background p-1.5" /></label>
          <label className="grid gap-1">Conversion<input type="date" value={pv.conversion} onChange={(e) => setPv({ ...pv, conversion: e.target.value })} className="rounded border border-input bg-background p-1.5" /></label>
          <label className="grid gap-1">Car care first visit (preview only)<input type="date" value={pv.car} onChange={(e) => setPv({ ...pv, car: e.target.value })} className="rounded border border-input bg-background p-1.5" /></label>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void runPreview()}>Preview</Button>
          <Button size="sm" disabled={busy || !preview} onClick={() => void apply()}>Apply</Button>
        </div>
        {preview && (
          <table className="mt-4 w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Date</th><th>Post</th><th>Channel</th><th>First line</th></tr></thead>
            <tbody>
              {[...preview].sort((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9")).filter((r) => r.waiting !== "Spare not needed").map((r) => { const p = byId.get(r.id); return (
                <tr key={r.id} className="border-t border-border"><td className="py-1">{r.date ? fmtDay(r.date) : r.waiting}</td><td>{p ? label(p) : ""}</td><td>{p ? CH[p.channel] : ""}</td><td>{(p?.template_copy ?? "").split("\n")[0]}</td></tr>
              ); })}
            </tbody>
          </table>
        )}
      </section>

      {range === 'month' && <div className="flex flex-wrap gap-2">
        {months.map((m) => (
          <Button key={m} variant={m === month ? 'default' : 'outline'} onClick={() => setMonth(m)}>
            {new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </Button>
        ))}
      </div>}
      {shown.length === 0 && <p className="text-sm text-muted-foreground">No posts in this period.</p>}
      {shown.filter(p=>platformFilter==='all'||p.channel===platformFilter).flatMap(p => (p.channel === 'meta_combined' ? ['facebook', 'instagram'] : [p.channel]).map(platform => card(p, platform)))}
      {waiting.length > 0 && (<>
        <h2 className="pt-4 text-xl font-bold text-foreground">Waiting</h2>
        {waiting.map(p => card(p))}
      </>)}
    </main>
  );
}
