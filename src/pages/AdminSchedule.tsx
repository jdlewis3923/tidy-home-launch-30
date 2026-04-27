// Admin Social Scheduler — drag-drop image uploads, grid of all 30 posts,
// inline edit caption & schedule, manual "Post now" + retry, status filters.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Upload,
  Image as ImageIcon,
  RotateCw,
  Send,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Status = "scheduled" | "ready" | "posting" | "posted" | "failed";

type Post = {
  id: string;
  day_number: number;
  scheduled_at: string;
  image_path: string;
  caption: string;
  status: Status;
  ig_post_id: string | null;
  fb_post_id: string | null;
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
};

type Filter = "all" | "scheduled" | "ready" | "posted" | "failed";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function publicImageUrl(image_path: string): string {
  const key = image_path.startsWith("social-images/")
    ? image_path.slice("social-images/".length)
    : image_path;
  return `${SUPABASE_URL}/storage/v1/object/public/social-images/${encodeURI(key)}`;
}

function statusBadgeVariant(s: Status): "default" | "secondary" | "destructive" | "outline" {
  if (s === "posted") return "default";
  if (s === "failed") return "destructive";
  if (s === "posting") return "secondary";
  return "outline";
}

function statusIcon(s: Status) {
  if (s === "posted") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s === "failed") return <AlertTriangle className="h-3.5 w-3.5" />;
  if (s === "posting") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  return <Clock className="h-3.5 w-3.5" />;
}

export default function AdminSchedule() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<"checking" | "yes" | "no">("checking");
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, { caption: string; scheduled_at: string }>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- auth ----------
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthed("no");
        navigate("/login?next=/admin/schedule");
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roles) {
        setAuthed("no");
        toast.error("Admin access required.");
        navigate("/");
        return;
      }
      setAuthed("yes");
    })();
    return () => unsub?.();
  }, [navigate]);

  // ---------- load + realtime ----------
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("social_posts")
      .select("*")
      .order("day_number", { ascending: true });
    if (error) {
      toast.error("Failed to load posts: " + error.message);
      return;
    }
    setPosts((data ?? []) as Post[]);
  }, []);

  useEffect(() => {
    if (authed !== "yes") return;
    load();
    const ch = supabase
      .channel("social_posts_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "social_posts" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authed, load]);

  // ---------- counts ----------
  const counts = useMemo(() => {
    const c: Record<Status, number> = { scheduled: 0, ready: 0, posting: 0, posted: 0, failed: 0 };
    for (const p of posts) c[p.status]++;
    return c;
  }, [posts]);

  const filtered = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter((p) => p.status === filter);
  }, [posts, filter]);

  // ---------- bulk upload ----------
  const onFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    let okCount = 0;
    let failCount = 0;
    for (const file of arr) {
      const path = file.name; // store at root of bucket; image_path = social-images/<filename>
      const { error } = await supabase.storage
        .from("social-images")
        .upload(path, file, { upsert: true, contentType: file.type || "image/png" });
      if (error) {
        failCount++;
        console.error("upload failed", file.name, error);
      } else {
        okCount++;
      }
    }
    setUploading(false);
    if (okCount) toast.success(`Uploaded ${okCount} image${okCount === 1 ? "" : "s"}`);
    if (failCount) toast.error(`${failCount} upload(s) failed (see console)`);
    // Force a refresh so previews update
    setPosts((p) => [...p]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
  };

  // ---------- per-post actions ----------
  const startEdit = (p: Post) => {
    setEditing((s) => ({
      ...s,
      [p.id]: {
        caption: p.caption,
        scheduled_at: format(new Date(p.scheduled_at), "yyyy-MM-dd'T'HH:mm"),
      },
    }));
  };
  const cancelEdit = (id: string) => {
    setEditing((s) => {
      const { [id]: _, ...rest } = s;
      return rest;
    });
  };
  const saveEdit = async (p: Post) => {
    const e = editing[p.id];
    if (!e) return;
    const iso = new Date(e.scheduled_at).toISOString();
    const { error } = await supabase
      .from("social_posts")
      .update({ caption: e.caption, scheduled_at: iso })
      .eq("id", p.id);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    toast.success(`Day ${p.day_number} updated`);
    cancelEdit(p.id);
  };

  const postNow = async (p: Post) => {
    setBusyId(p.id);
    const { data, error } = await supabase.functions.invoke("meta-publish-post", {
      body: { post_id: p.id },
    });
    setBusyId(null);
    if (error) {
      toast.error("Publish failed: " + error.message);
      return;
    }
    if ((data as any)?.ok === false) {
      toast.error("Publish failed: " + ((data as any)?.error ?? "unknown"));
      return;
    }
    toast.success(`Day ${p.day_number} posted`);
  };

  const archive = async (p: Post) => {
    if (!confirm(`Archive day ${p.day_number}? It will be deleted.`)) return;
    const { error } = await supabase.from("social_posts").delete().eq("id", p.id);
    if (error) toast.error("Archive failed: " + error.message);
    else toast.success(`Day ${p.day_number} archived`);
  };

  if (authed === "checking") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (authed === "no") return null;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Social Scheduler · Tidy Admin</title>
      </Helmet>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Social Scheduler</h1>
            <p className="text-sm text-muted-foreground">
              30-day Instagram + Facebook auto-posts. Cron fires every minute.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {counts.posted} posted
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3.5 w-3.5" /> {counts.scheduled} scheduled
            </Badge>
            {counts.ready > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3.5 w-3.5" /> {counts.ready} ready
              </Badge>
            )}
            {counts.posting > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {counts.posting} posting
              </Badge>
            )}
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> {counts.failed} failed
            </Badge>
          </div>
        </header>

        {/* Upload zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="mb-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-8 text-center transition-colors hover:border-muted-foreground/50"
        >
          <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Drop your 32 PNGs here, or click to browse</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Filenames must match (e.g. <code>day-01.png</code>). Existing files will be overwritten.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && onFiles(e.target.files)}
          />
          <Button
            variant="secondary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? "Uploading..." : "Choose files"}
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "scheduled", "ready", "posted", "failed"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
              {f !== "all" && <span className="ml-1.5 opacity-60">({counts[f as Status]})</span>}
            </Button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const isEditing = !!editing[p.id];
            const e = editing[p.id];
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
                  p.status === "failed" && "border-destructive/40",
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Day {p.day_number}
                    </div>
                    <div className="text-sm font-medium">
                      {format(new Date(p.scheduled_at), "EEE MMM d, h:mm a")}
                    </div>
                  </div>
                  <Badge variant={statusBadgeVariant(p.status)} className="gap-1">
                    {statusIcon(p.status)}
                    {p.status}
                  </Badge>
                </div>

                {/* Image preview */}
                <div className="mb-3 aspect-square w-full overflow-hidden rounded-md border bg-muted">
                  <img
                    src={publicImageUrl(p.image_path)}
                    alt={`Day ${p.day_number}`}
                    className="h-full w-full object-cover"
                    onError={(ev) => {
                      const t = ev.currentTarget;
                      t.style.display = "none";
                      const sib = t.nextElementSibling as HTMLElement | null;
                      if (sib) sib.style.display = "flex";
                    }}
                  />
                  <div
                    className="hidden h-full w-full items-center justify-center text-muted-foreground"
                    style={{ display: "none" }}
                  >
                    <ImageIcon className="h-8 w-8" />
                  </div>
                </div>

                <div className="mb-2 text-[11px] text-muted-foreground">
                  <code>{p.image_path}</code>
                </div>

                {/* Caption / edit */}
                {isEditing ? (
                  <div className="mb-3 space-y-2">
                    <Textarea
                      value={e.caption}
                      onChange={(ev) =>
                        setEditing((s) => ({ ...s, [p.id]: { ...s[p.id], caption: ev.target.value } }))
                      }
                      rows={5}
                      className="text-sm"
                    />
                    <Input
                      type="datetime-local"
                      value={e.scheduled_at}
                      onChange={(ev) =>
                        setEditing((s) => ({
                          ...s,
                          [p.id]: { ...s[p.id], scheduled_at: ev.target.value },
                        }))
                      }
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(p)}>
                        <Save className="mr-1 h-3.5 w-3.5" /> Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => cancelEdit(p.id)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mb-3 max-h-28 overflow-y-auto whitespace-pre-wrap text-sm text-foreground/90">
                    {p.caption}
                  </p>
                )}

                {/* Error */}
                {p.error_message && (
                  <div className="mb-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                    {p.error_message}
                  </div>
                )}

                {/* Post links */}
                {(p.ig_post_id || p.fb_post_id) && (
                  <div className="mb-3 flex flex-wrap gap-2 text-xs">
                    {p.ig_post_id && (
                      <a
                        href={`https://www.instagram.com/p/${p.ig_post_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        IG <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {p.fb_post_id && (
                      <a
                        href={`https://www.facebook.com/${p.fb_post_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        FB <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}

                {/* Controls */}
                <div className="flex flex-wrap gap-2">
                  {!isEditing && (
                    <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                      Edit
                    </Button>
                  )}
                  {(p.status === "scheduled" || p.status === "ready" || p.status === "failed") && (
                    <Button
                      size="sm"
                      onClick={() => postNow(p)}
                      disabled={busyId === p.id}
                    >
                      {busyId === p.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : p.status === "failed" ? (
                        <RotateCw className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Send className="mr-1 h-3.5 w-3.5" />
                      )}
                      {p.status === "failed" ? "Retry" : "Post now"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => archive(p)} className="ml-auto text-muted-foreground">
                    Archive
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="mt-12 text-center text-muted-foreground">
            <p>No posts in this filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
