/**
 * /admin/social — the social calendar, tied to launch_config.
 * Every post is a template; {LAUNCH}, {CONVERT} and {CAR_LINE} are filled on
 * the day it posts. The planner (social-plan) places posts from the launch
 * dates, nightly and whenever a launch date changes. Posted rows never move.
 * Facebook + Instagram publish automatically once; Nextdoor is posted by hand
 * from the 9 AM digest and marked posted here.
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
  image_url: string | null; image_subject: string | null; image_flag: string | null; status: string; posted_at: string | null;
  content_hash: string | null; publish_error: string | null; waiting_reason: string | null; priority: number | null; is_spare: boolean;
};
const CH: Record<string, string> = { meta_combined: "Facebook + Instagram", instagram: "Instagram", facebook: "Facebook", nextdoor: "Nextdoor" };
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

  const anchors: PlanAnchors = useMemo(() => ({
    launch: cfg?.cleaning?.first_visit_date ?? null, conversion: cfg?.cleaning?.conversion_date ?? null, carLaunch: cfg?.car?.first_visit_date ?? null,
    hangerDrop1: (cfg?.global?.hanger_drops ?? []).map((d) => d.start).sort()[0] ?? null,
  }), [cfg]);
  useEffect(() => { setPv({ launch: anchors.launch ?? "", conversion: anchors.conversion ?? "", car: anchors.carLaunch ?? "" }); }, [anchors]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("social_launch_posts")
      .select("id, post_number, channel, scheduled_for, caption, template_copy, image_url, image_subject, image_flag, status, posted_at, content_hash, publish_error, waiting_reason, priority, is_spare")
      .is("archived_at", null).order("scheduled_for", { nullsFirst: false });
    setPosts((data ?? []) as Post[]);
  }, []);
  useEffect(() => { if (hasRole) void load(); }, [hasRole, load]);
  useEffect(() => {
    const p = posts.find((x) => x.id === focus);
    if (p?.scheduled_for) { setMonth(monthKey(p.scheduled_for)); setTimeout(() => document.getElementById(`post-${p.id}`)?.scrollIntoView({ block: "center" }), 50); }
  }, [focus, posts]);

  const placed = posts.filter((p) => p.scheduled_for);
  const waiting = posts.filter((p) => !p.scheduled_for && !p.posted_at && !(p.is_spare && p.waiting_reason === "Spare not needed"));
  const months = useMemo(() => [...new Set(placed.map((p) => monthKey(p.scheduled_for!)))], [placed]);

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
  const markPosted = async (p: Post) => {
    const { error } = await supabase.rpc("admin_mark_social_posted", { _id: p.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Marked posted"); void load();
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
  const shown = placed.filter((p) => monthKey(p.scheduled_for!) === month);
  const card = (p: Post) => {
    const tpl = edit[p.id] ?? p.template_copy ?? p.caption ?? "";
    const day = p.scheduled_for ? etDate(p.scheduled_for) : new Date().toISOString().slice(0, 10);
    const rendered = renderTemplate(tpl, anchors, day);
    const locked = p.status === "posted" || p.status === "posting";
    return (
      <section key={p.id} id={`post-${p.id}`} className={`rounded-xl border p-4 ${focus === p.id ? "border-primary" : "border-border"} bg-card`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-bold text-foreground">{label(p)} · {p.scheduled_for ? fmt(p.scheduled_for) : p.waiting_reason ?? "Waiting"} · {CH[p.channel] ?? p.channel}</p>
          <div className="flex gap-2">
            {p.image_flag && <span className="rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold text-destructive-foreground">Needs image</span>}
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">{p.status}</span>
          </div>
        </div>
        {p.image_flag && <p className="mt-1 text-xs text-destructive">{p.image_flag}</p>}
        {p.publish_error && <p className="mt-1 text-xs text-destructive">{p.publish_error}</p>}
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_140px]">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Template</p>
            <textarea rows={7} disabled={locked} value={tpl} onChange={(ev) => setEdit({ ...edit, [p.id]: ev.target.value })} className="w-full rounded border border-input bg-background p-2 text-sm" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">As it will post{p.channel !== "nextdoor" ? " (Facebook / Instagram)" : ""}</p>
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs text-foreground">{rendered}</pre>
            {p.channel !== "nextdoor" && <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs text-foreground">{instagramVersion(rendered)}</pre>}
          </div>
          <div>{p.image_url ? <img src={p.image_url} alt="" className="w-full rounded object-cover" /> : <div className="flex h-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">No image</div>}
            <p className="mt-1 text-[11px] text-muted-foreground">{p.image_subject}</p></div>
        </div>
        {!locked && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void save(p)}>Save copy</Button>
            {p.channel === "nextdoor" && p.scheduled_for && (
              <>
                <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(rendered); toast.success("Copy copied"); }}>Copy text</Button>
                <Button size="sm" onClick={() => void markPosted(p)}>Mark posted</Button>
              </>
            )}
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
        <p className="mt-1 text-sm text-muted-foreground">Facebook + Instagram: Mon / Wed / Fri 11 AM ET, published automatically once. Nextdoor: Thursday 6 PM ET, posted by you from the 9 AM digest. Dates follow your launch dates and re-plan when they change.</p>
      </header>

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

      <div className="flex flex-wrap gap-2">
        {months.map((m) => (
          <button key={m} type="button" onClick={() => setMonth(m)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${m === month ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}>
            {new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">No posts this month.</p>}
      {shown.map(card)}
      {waiting.length > 0 && (<>
        <h2 className="pt-4 text-xl font-bold text-foreground">Waiting</h2>
        {waiting.map(card)}
      </>)}
    </main>
  );
}
