/**
 * /admin/social — the social calendar. One post, one row, published once.
 * Facebook + Instagram go out automatically when "scheduled"; Nextdoor is
 * posted by hand (listed in the 9 AM digest) and marked posted here.
 * The database refuses: the same copy twice within 90 days, scheduling with
 * no copy, and Instagram without an image. Empty slots stay "Needs a post".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";

type Post = {
  id: string; channel: string; scheduled_for: string; caption: string | null; image_url: string | null;
  status: string; posted_at: string | null; content_hash: string | null; theme: string | null; publish_error: string | null;
};
const CH: Record<string, string> = { meta_combined: "Facebook + Instagram", instagram: "Instagram", facebook: "Facebook", nextdoor: "Nextdoor" };
const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const monthKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);

export default function AdminSocial() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const [params] = useSearchParams();
  const focus = params.get("post");
  const [posts, setPosts] = useState<Post[]>([]);
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [edit, setEdit] = useState<Record<string, { caption: string; image_url: string }>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("social_launch_posts")
      .select("id, channel, scheduled_for, caption, image_url, status, posted_at, content_hash, theme, publish_error")
      .is("archived_at", null).gte("scheduled_for", new Date(Date.now() - 31 * 864e5).toISOString()).order("scheduled_for");
    setPosts((data ?? []) as Post[]);
  }, []);
  useEffect(() => { if (hasRole) void load(); }, [hasRole, load]);
  useEffect(() => {
    const p = posts.find((x) => x.id === focus);
    if (p) { setMonth(monthKey(p.scheduled_for)); setTimeout(() => document.getElementById(`post-${p.id}`)?.scrollIntoView({ block: "center" }), 50); }
  }, [focus, posts]);

  const dupHashes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of posts) if (p.content_hash && p.status !== "skipped") seen.set(p.content_hash, (seen.get(p.content_hash) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([h]) => h));
  }, [posts]);
  const months = useMemo(() => [...new Set(posts.map((p) => monthKey(p.scheduled_for)))], [posts]);

  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Loading…</main>;
  if (!hasRole) return <Navigate to="/login" replace />;

  const save = async (p: Post, status: "draft" | "scheduled") => {
    const e = edit[p.id] ?? { caption: p.caption ?? "", image_url: p.image_url ?? "" };
    const { error } = await supabase.from("social_launch_posts").update({ caption: e.caption, image_url: e.image_url || null, status }).eq("id", p.id);
    if (error) { toast.error(error.message.replace(/^.*?: /, "")); return; }
    toast.success(status === "scheduled" ? "Scheduled — publishes once at its time" : "Saved as draft");
    void load();
  };
  const markPosted = async (p: Post) => {
    const { error } = await supabase.rpc("admin_mark_social_posted", { _id: p.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Marked posted"); void load();
  };

  const shown = posts.filter((p) => monthKey(p.scheduled_for) === month);
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <header>
        <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Social calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Facebook + Instagram: Mon / Wed / Fri 11 AM ET, published automatically once. Nextdoor: every other Thursday 6 PM ET, posted by you — it's in that morning's 9 AM digest.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {months.map((m) => (
          <button key={m} type="button" onClick={() => setMonth(m)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${m === month ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}>
            {new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">No posts this month.</p>}
      {shown.map((p) => {
        const e = edit[p.id] ?? { caption: p.caption ?? "", image_url: p.image_url ?? "" };
        const dup = p.content_hash && dupHashes.has(p.content_hash);
        const needsImg = p.channel !== "nextdoor" && !e.image_url;
        const locked = p.status === "posted" || p.status === "posting";
        return (
          <section key={p.id} id={`post-${p.id}`} className={`rounded-xl border p-4 ${dup ? "border-destructive bg-destructive/5" : focus === p.id ? "border-primary" : "border-border"} bg-card`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-bold text-foreground">{fmt(p.scheduled_for)} · {CH[p.channel] ?? p.channel}</p>
              <div className="flex gap-2">
                {dup && <span className="rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold text-destructive-foreground">Duplicate</span>}
                {!p.caption?.trim() && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-foreground">Needs a post</span>}
                {needsImg && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground">Needs image</span>}
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">{p.status}</span>
              </div>
            </div>
            {p.theme && <p className="mt-1 text-xs text-muted-foreground">Theme: {p.theme}</p>}
            {p.publish_error && <p className="mt-1 text-xs text-destructive">{p.publish_error}</p>}
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
              <textarea rows={4} disabled={locked} value={e.caption} onChange={(ev) => setEdit({ ...edit, [p.id]: { ...e, caption: ev.target.value } })}
                placeholder="Write this post's copy" className="rounded border border-input bg-background p-2 text-sm" />
              <div className="space-y-2">
                {e.image_url ? <img src={e.image_url} alt="" className="h-24 w-full rounded object-cover" /> : <div className="flex h-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">No image</div>}
                <input disabled={locked} value={e.image_url} onChange={(ev) => setEdit({ ...edit, [p.id]: { ...e, image_url: ev.target.value } })} placeholder="Image URL" className="w-full rounded border border-input bg-background p-1.5 text-xs" />
              </div>
            </div>
            {!locked && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void save(p, "draft")}>Save draft</Button>
                {p.channel !== "nextdoor" && <Button size="sm" onClick={() => void save(p, "scheduled")}>Schedule</Button>}
                {p.channel === "nextdoor" && (
                  <>
                    <Button size="sm" variant="outline" disabled={!e.caption.trim()} onClick={() => { void navigator.clipboard.writeText(e.caption); toast.success("Copy copied"); }}>Copy text</Button>
                    <Button size="sm" disabled={!e.caption.trim()} onClick={() => void markPosted(p)}>Mark posted</Button>
                  </>
                )}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
