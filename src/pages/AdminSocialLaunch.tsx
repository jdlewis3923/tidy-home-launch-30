/**
 * Admin Founding Neighbor Social Campaign — /admin/social-launch
 *
 * Two stacked campaigns:
 *   - Nextdoor: 6 posts, one every 14 days, Thursdays 6:00 PM America/New_York.
 *     Nextdoor has NO public API for publishing organic business posts, so arming
 *     only schedules a reminder — an admin publishes each post inside Nextdoor and
 *     marks the row posted here.
 *   - Meta IG+FB: 36 posts, auto-published by the social-launch-publisher function.
 *
 * Captions live in `src/lib/socialCampaign.ts` (evergreen, EN + ES, per-ZIP
 * attributed links) and are written into the row at ARM time, together with the
 * scheduled date computed from the settable campaign START DATE and, for Nextdoor,
 * the settable cadence (interval days / weekday / hour).
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  UploadCloud,
  Copy,
  CheckCircle2,
  Loader2,
  Rocket,
  Send,
  AlertCircle,
  CalendarDays,
  Hand,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_NAMES,
  NEXTDOOR_POSTS,
  META_POSTS,
  buildCaption,
  scheduledFor,
  defaultStartDate,
  parseCadence,
  DEFAULT_NEXTDOOR_CADENCE,
  type CampaignCadence,
  type CampaignPost,
} from "@/lib/socialCampaign";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


type Channel = "nextdoor" | "instagram" | "facebook" | "meta_combined";
type Platform = "nextdoor" | "meta";
type Status = "pending" | "image_uploaded" | "scheduled" | "armed" | "posted" | "failed" | "skipped";

type Row = {
  id: string;
  channel: Channel;
  post_number: number;
  scheduled_for: string;
  title: string | null;
  caption: string;
  image_url: string | null;
  image_filename: string | null;
  status: Status;
  posted_at: string | null;
  armed_at: string | null;
  publish_error: string | null;
};

/** A DB row joined to its library copy — the library always wins for display. */
type Post = Row & { libTitle: string; libCaption: string; plannedFor: string };

const STATUS_BADGE: Record<Status, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-slate-200 text-slate-700" },
  image_uploaded: { label: "Image uploaded", className: "bg-amber-200 text-amber-900" },
  scheduled: { label: "Scheduled", className: "bg-blue-200 text-blue-900" },
  armed: { label: "Armed", className: "bg-blue-600 text-white" },
  posted: { label: "Posted", className: "bg-emerald-600 text-white" },
  failed: { label: "Failed", className: "bg-red-600 text-white" },
  skipped: { label: "Skipped", className: "bg-slate-400 text-white" },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------- Card ----------

function PostCard({
  post,
  onUpload,
  onChange,
}: {
  post: Post;
  onUpload: (post: Post, file: File) => Promise<void>;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const caption = post.libCaption;
  const captionPreview = expanded ? caption : caption.slice(0, 150);
  const truncated = caption.length > 150;

  const handleFiles = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image file");
        return;
      }
      setBusy(true);
      try {
        await onUpload(post, file);
      } finally {
        setBusy(false);
      }
    },
    [post, onUpload],
  );

  const copyCaption = async () => {
    await navigator.clipboard.writeText(caption);
    toast.success(`Post #${post.post_number} caption copied`);
  };

  const badge = STATUS_BADGE[post.status];

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-white shadow-sm overflow-hidden",
        post.status === "armed" && "ring-2 ring-blue-500",
        post.status === "posted" && "ring-2 ring-emerald-500",
        post.status === "failed" && "ring-2 ring-red-500",
      )}
      style={{ minHeight: 420 }}
    >
      {/* Top metadata strip */}
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        <span className="font-bold text-slate-900">Post {post.post_number}</span>
        <span className="text-slate-600">
          {fmtDate(post.status === "posted" || post.status === "armed" ? post.scheduled_for : post.plannedFor)}
        </span>
      </div>

      {/* Image / drop zone */}
      {post.image_url ? (
        <div className="mx-3 aspect-square overflow-hidden rounded-lg border-2 border-amber-300">
          <img src={post.image_url} alt={`Post ${post.post_number}`} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFiles(f);
          }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "mx-3 aspect-square cursor-pointer rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition",
            dragOver ? "border-amber-500 bg-amber-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100",
          )}
        >
          {busy ? (
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          ) : (
            <>
              <UploadCloud className="h-10 w-10 text-slate-400" />
              <span className="text-sm font-medium text-slate-500">Drag image here</span>
              <span className="text-xs text-slate-400">or click to browse</span>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFiles(f);
            }}
          />
        </div>
      )}

      {/* Caption preview */}
      <div className="flex-1 px-3 py-2 text-xs text-slate-700">
        <p className="mb-1 font-semibold text-slate-900">{post.libTitle}</p>
        <p className="whitespace-pre-wrap leading-snug">
          {captionPreview}
          {truncated && !expanded && "… "}
          {truncated && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              className="font-medium text-blue-600 hover:underline"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </p>
      </div>

      {/* Footer: badge + copy */}
      <div className="flex items-center justify-between border-t px-3 py-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", badge.className)}>
          {badge.label}
        </span>
        <button
          type="button"
          onClick={copyCaption}
          className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
          title="Copy caption"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>

      {post.publish_error && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-red-700">
          {post.publish_error}
        </div>
      )}
    </div>
  );
}

// ---------- Section ----------

function CampaignSection({
  title,
  subtitle,
  posts,
  cols,
  headerBg,
  onUpload,
  onArmSection,
  refresh,
}: {
  title: string;
  subtitle: string;
  posts: Post[];
  cols: string;
  headerBg: string;
  onUpload: (post: Post, file: File) => Promise<void>;
  onArmSection: () => Promise<void>;
  refresh: () => void;
}) {
  const total = posts.length;
  const withImage = posts.filter((p) => p.image_url).length;
  const armed = posts.filter((p) => p.status === "armed" || p.status === "posted").length;
  const posted = posts.filter((p) => p.status === "posted").length;
  const ready = total > 0 && withImage === total;
  const allArmed = total > 0 && armed === total;
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="mb-12">
      <div
        className={cn(
          "sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-t-xl px-5 py-4 text-white shadow",
          headerBg,
        )}
      >
        <div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <p className="text-sm opacity-90">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-full bg-white/15 px-3 py-1">
            Images: <b>{withImage}/{total}</b>
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1">
            Captions ready: <b>{total}/{total}</b>
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1">
            Armed: <b>{armed}/{total}</b>
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1">
            Posted: <b>{posted}/{total}</b>
          </span>
          <Button
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={!ready || allArmed}
            className="bg-amber-400 text-slate-900 hover:bg-amber-300 disabled:opacity-50"
          >
            <Send className="mr-1 h-3.5 w-3.5" />
            {allArmed ? "Armed" : `Arm ${title.split(" ")[0]} Campaign`}
          </Button>
        </div>
      </div>

      <div className={cn("grid gap-4 rounded-b-xl border border-t-0 bg-slate-50 p-5", cols)}>
        {posts.map((p) => (
          <PostCard key={p.id} post={p} onUpload={onUpload} onChange={refresh} />
        ))}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arm {title}?</DialogTitle>
            <DialogDescription>
              {withImage} posts get the current captions and the schedule built from your campaign start date,
              then publish automatically. New uploads after arming require re-arming.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                await onArmSection();
                setConfirming(false);
              }}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Confirm Arm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------- Page ----------

export default function AdminSocialLaunch() {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>(defaultStartDate());
  const [savingDate, setSavingDate] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data, error }, settings] = await Promise.all([
      supabase
        .from("social_launch_posts")
        .select("*")
        .order("channel", { ascending: true })
        .order("post_number", { ascending: true }),
      supabase.from("app_settings").select("value").eq("key", "social_campaign_start_date").maybeSingle(),
    ]);
    if (error) {
      toast.error("Failed to load posts");
      return;
    }
    const saved = settings.data?.value;
    if (typeof saved === "string" && /^\d{4}-\d{2}-\d{2}$/.test(saved)) setStartDate(saved);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasRole) void refresh();
  }, [hasRole, refresh]);

  /** Join DB rows to library copy + planned schedule. */
  const join = useCallback(
    (library: CampaignPost[], platform: Platform, channels: Channel[]): Post[] => {
      const pool = rows.filter((r) => channels.includes(r.channel));
      return library
        .map((lib, index) => {
          const row = pool.find((r) => r.post_number === lib.post_number);
          if (!row) return null;
          return {
            ...row,
            libTitle: lib.title,
            libCaption: buildCaption(lib, platform),
            plannedFor: scheduledFor(startDate, platform, index).toISOString(),
          } as Post;
        })
        .filter((p): p is Post => p !== null);
    },
    [rows, startDate],
  );

  const nextdoor = useMemo(() => join(NEXTDOOR_POSTS, "nextdoor", ["nextdoor"]), [join]);
  const meta = useMemo(
    () => join(META_POSTS, "meta", ["meta_combined", "instagram", "facebook"]),
    [join],
  );
  const allPosts = useMemo(() => [...nextdoor, ...meta], [nextdoor, meta]);

  const totalImages = allPosts.filter((p) => p.image_url).length;
  const allReady = allPosts.length > 0 && totalImages === allPosts.length;
  const remaining = allPosts.length - totalImages;

  const saveStartDate = useCallback(async (next: string) => {
    setStartDate(next);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    setSavingDate(true);
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "social_campaign_start_date", value: next, updated_by: authData.user?.id ?? null });
    setSavingDate(false);
    if (error) toast.error(`Could not save start date: ${error.message}`);
    else toast.success("Campaign start date saved");
  }, []);

  const onUpload = useCallback(async (post: Post, file: File) => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${post.channel}/${post.post_number}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("social-images").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`);
      return;
    }
    const { data: urlData } = supabase.storage.from("social-images").getPublicUrl(path);
    const { error: updErr } = await supabase
      .from("social_launch_posts")
      .update({
        image_url: urlData.publicUrl,
        image_filename: file.name,
        status: post.status === "posted" ? post.status : "image_uploaded",
      })
      .eq("id", post.id);
    if (updErr) {
      toast.error(`Save failed: ${updErr.message}`);
      return;
    }
    toast.success(`Post #${post.post_number} image uploaded`);
    void refresh();
  }, [refresh]);

  /** Arming writes the live caption, title and computed schedule onto each row. */
  const armPosts = useCallback(async (targets: Post[]) => {
    const armable = targets.filter((p) => p.status === "image_uploaded");
    if (armable.length === 0) {
      toast.info("Nothing to arm");
      return 0;
    }
    const armed_at = new Date().toISOString();
    const results = await Promise.all(
      armable.map((p) =>
        supabase
          .from("social_launch_posts")
          .update({
            title: p.libTitle,
            caption: p.libCaption,
            scheduled_for: p.plannedFor,
            status: "armed",
            armed_at,
            publish_error: null,
          })
          .eq("id", p.id),
      ),
    );
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      toast.error(`Arm failed on ${failed.length} posts: ${failed[0].error?.message}`);
    } else {
      toast.success(`Armed ${armable.length} posts`);
    }
    void refresh();
    return armable.length - failed.length;
  }, [refresh]);

  const armAll = useCallback(async () => {
    await armPosts(allPosts);
    setLaunchOpen(false);
  }, [armPosts, allPosts]);

  if (roleLoading) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!hasRole) return <Navigate to="/" replace />;

  const ndRange = nextdoor.length
    ? `${fmtShort(nextdoor[0].plannedFor)} → ${fmtShort(nextdoor[nextdoor.length - 1].plannedFor)}`
    : "";
  const metaRange = meta.length
    ? `${fmtShort(meta[0].plannedFor)} → ${fmtShort(meta[meta.length - 1].plannedFor)}`
    : "";

  return (
    <div className="min-h-screen bg-slate-100">
      <Helmet>
        <title>Founding Neighbor Social Campaign · Admin</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Sticky header with Launch All */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="grid h-9 w-9 place-items-center rounded-md bg-white/10 hover:bg-white/20">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Founding Neighbor Social Campaign</h1>
              <p className="text-xs text-slate-300">
                {totalImages}/{allPosts.length} images uploaded · evergreen captions, EN + ES
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              Start date
              <Input
                type="date"
                value={startDate}
                onChange={(e) => saveStartDate(e.target.value)}
                className="h-7 w-[140px] border-white/20 bg-white/10 text-xs text-white"
              />
              {savingDate && <Loader2 className="h-3 w-3 animate-spin" />}
            </label>
            {!allReady && (
              <span className="hidden text-xs text-amber-300 md:inline-flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Upload remaining {remaining} images first
              </span>
            )}
            <Button
              onClick={() => setLaunchOpen(true)}
              disabled={!allReady}
              className="bg-amber-400 font-bold text-slate-900 shadow-[0_0_24px_rgba(251,191,36,0.5)] hover:bg-amber-300 disabled:opacity-50 disabled:shadow-none"
              title={allReady ? "Arm all posts" : `Upload remaining ${remaining} images first`}
            >
              <Rocket className="mr-2 h-4 w-4" />
              Launch All Campaigns
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-6 py-8">
        {loading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            <CampaignSection
              title={CAMPAIGN_NAMES.nextdoor}
              subtitle={`${ndRange} · ${nextdoor.length} posts`}
              posts={nextdoor}
              cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
              headerBg="bg-slate-900"
              onUpload={onUpload}
              onArmSection={() => armPosts(nextdoor).then(() => undefined)}
              refresh={refresh}
            />
            <CampaignSection
              title={CAMPAIGN_NAMES.meta}
              subtitle={`${metaRange} · ${meta.length} posts`}
              posts={meta}
              cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
              headerBg="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500"
              onUpload={onUpload}
              onArmSection={() => armPosts(meta).then(() => undefined)}
              refresh={refresh}
            />
          </>
        )}
      </div>

      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arm {allPosts.length} posts?</DialogTitle>
            <DialogDescription>
              Nextdoor: {nextdoor.length} · Meta: {meta.length}
              {allPosts.length > 0 && (
                <>
                  <br />
                  First post fires:{" "}
                  <b>
                    {new Date(nextdoor[0]?.plannedFor ?? meta[0]?.plannedFor).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </b>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLaunchOpen(false)}>Cancel</Button>
            <Button onClick={armAll} className="bg-blue-600 text-white hover:bg-blue-700">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirm Launch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
