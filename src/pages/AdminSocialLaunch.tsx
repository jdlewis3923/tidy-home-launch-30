/**
 * Admin Social Launch Campaign — /admin/social-launch
 *
 * Unified pre-launch campaign dashboard. Admin-only. One place for Justin
 * to see, prep, and ship every pre-launch post across all channels.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  Copy,
  CheckCircle2,
  CalendarDays,
  LayoutGrid,
  ExternalLink,
  Loader2,
  Image as ImageIcon,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Channel = "nextdoor" | "instagram" | "facebook" | "meta_combined";
type Status = "pending" | "image_uploaded" | "scheduled" | "posted" | "skipped";

type Post = {
  id: string;
  channel: Channel;
  post_number: number;
  scheduled_for: string;
  title: string | null;
  caption: string;
  image_url: string | null;
  image_filename: string | null;
  status: Status;
  scheduled_in_native_tool_at: string | null;
  posted_at: string | null;
  notes: string | null;
};

const LAUNCH_DATE = new Date("2026-05-26T13:00:00Z");

const CHANNEL_META: Record<Channel, { label: string; bg: string; text: string; scheduler: string }> = {
  nextdoor: { label: "Nextdoor", bg: "bg-blue-100", text: "text-blue-800", scheduler: "https://nextdoor.com/business/posts" },
  instagram: { label: "Instagram", bg: "bg-pink-100", text: "text-pink-800", scheduler: "https://business.facebook.com/latest/posts/scheduled_posts" },
  facebook: { label: "Facebook", bg: "bg-blue-100", text: "text-blue-900", scheduler: "https://business.facebook.com/latest/posts/scheduled_posts" },
  meta_combined: { label: "Meta (IG/FB)", bg: "bg-purple-100", text: "text-purple-800", scheduler: "https://business.facebook.com/latest/posts/scheduled_posts" },
};

const STATUS_META: Record<Status, { label: string; className: string }> = {
  pending: { label: "Pending image", className: "bg-amber-100 text-amber-800 border-amber-300" },
  image_uploaded: { label: "Image uploaded", className: "bg-sky-100 text-sky-800 border-sky-300" },
  scheduled: { label: "Scheduled", className: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  posted: { label: "Posted", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  skipped: { label: "Skipped", className: "bg-muted text-muted-foreground border-border" },
};

type FilterChip = "all" | Channel | "pending" | "ready" | "posted";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  }) + " ET";
};

const daysUntil = (target: Date) => {
  const ms = target.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

export default function AdminSocialLaunch() {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "calendar">("grid");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [sort, setSort] = useState<"scheduled_for" | "post_number" | "status">("scheduled_for");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, string>>({}); // id -> draft caption
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("social_launch_posts" as any)
      .select("*")
      .order("scheduled_for", { ascending: true });
    if (error) {
      toast.error(`Failed to load posts: ${error.message}`);
    } else {
      setPosts((data as unknown as Post[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasRole) load();
  }, [hasRole, load]);

  const counts = useMemo(() => {
    const pending = posts.filter((p) => p.status === "pending").length;
    const ready = posts.filter((p) => p.status === "image_uploaded" || p.status === "scheduled").length;
    const posted = posts.filter((p) => p.status === "posted").length;
    return { pending, ready, posted, total: posts.length };
  }, [posts]);

  const filtered = useMemo(() => {
    let list = [...posts];
    if (filter === "nextdoor") list = list.filter((p) => p.channel === "nextdoor");
    else if (filter === "instagram") list = list.filter((p) => p.channel === "instagram");
    else if (filter === "facebook") list = list.filter((p) => p.channel === "facebook");
    else if (filter === "meta_combined") list = list.filter((p) => p.channel === "meta_combined" || p.channel === "instagram" || p.channel === "facebook");
    else if (filter === "pending") list = list.filter((p) => p.status === "pending");
    else if (filter === "ready") list = list.filter((p) => p.status === "image_uploaded" || p.status === "scheduled");
    else if (filter === "posted") list = list.filter((p) => p.status === "posted");

    if (sort === "scheduled_for") list.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
    else if (sort === "post_number") list.sort((a, b) => a.post_number - b.post_number);
    else if (sort === "status") list.sort((a, b) => a.status.localeCompare(b.status));

    return list;
  }, [posts, filter, sort]);

  const updatePost = async (id: string, patch: Partial<Post>) => {
    const { error } = await supabase.from("social_launch_posts" as any).update(patch as any).eq("id", id);
    if (error) {
      toast.error(`Update failed: ${error.message}`);
      return false;
    }
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } as Post : p)));
    return true;
  };

  const handleUpload = async (post: Post, file: File) => {
    setUploading((u) => ({ ...u, [post.id]: true }));
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${post.channel}/${post.post_number}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("social-images").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("social-images").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl || null;
      const newStatus: Status = post.status === "pending" ? "image_uploaded" : post.status;
      await updatePost(post.id, { image_url: url, image_filename: path, status: newStatus });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading((u) => ({ ...u, [post.id]: false }));
    }
  };

  const copyCaption = async (post: Post) => {
    await navigator.clipboard.writeText(post.caption);
    toast.success(`Copied — paste into ${CHANNEL_META[post.channel].label} scheduler`);
  };

  const markScheduled = async (post: Post) => {
    const ok = await updatePost(post.id, { status: "scheduled", scheduled_in_native_tool_at: new Date().toISOString() });
    if (ok) toast.success("Marked scheduled");
  };

  const markPosted = async (post: Post) => {
    const ok = await updatePost(post.id, { status: "posted", posted_at: new Date().toISOString() });
    if (ok) toast.success("Marked posted");
  };

  const saveCaption = async (post: Post) => {
    const draft = editing[post.id];
    if (draft == null) return;
    const ok = await updatePost(post.id, { caption: draft });
    if (ok) {
      setEditing((e) => {
        const next = { ...e };
        delete next[post.id];
        return next;
      });
      toast.success("Caption updated");
    }
  };

  if (roleLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!hasRole) return <Navigate to="/" replace />;

  const days = daysUntil(LAUNCH_DATE);

  // --- Calendar data ---
  const monthsToShow = [
    { year: 2026, month: 3 }, // April (0-indexed)
    { year: 2026, month: 4 }, // May
  ];
  const postsByDay: Record<string, Post[]> = {};
  for (const p of posts) {
    const d = new Date(p.scheduled_for);
    const key = d.toISOString().slice(0, 10);
    if (!postsByDay[key]) postsByDay[key] = [];
    postsByDay[key].push(p);
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Social Launch Campaign · Tidy Admin</title>
      </Helmet>

      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/health">
              <ArrowLeft className="mr-2 h-4 w-4" /> Admin
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">Social Launch Campaign</h1>
            <p className="text-sm text-muted-foreground">Prep and ship every pre-launch post.</p>
          </div>
          <Badge className="bg-primary text-primary-foreground text-base px-3 py-1.5">
            {days} days to May 26
          </Badge>
        </div>
        <div className="container mx-auto px-4 pb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant="outline" className={STATUS_META.pending.className}>Pending images: {counts.pending}</Badge>
          <Badge variant="outline" className={STATUS_META.image_uploaded.className}>Ready: {counts.ready}</Badge>
          <Badge variant="outline" className={STATUS_META.posted.className}>Posted: {counts.posted}</Badge>
          <span className="text-muted-foreground ml-2">Total: {counts.total}</span>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="inline-flex rounded-md border bg-card p-1">
            <Button size="sm" variant={view === "grid" ? "default" : "ghost"} onClick={() => setView("grid")}>
              <LayoutGrid className="h-4 w-4 mr-1.5" /> Grid
            </Button>
            <Button size="sm" variant={view === "calendar" ? "default" : "ghost"} onClick={() => setView("calendar")}>
              <CalendarDays className="h-4 w-4 mr-1.5" /> Calendar
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {([
              ["all", "All channels"],
              ["nextdoor", "Nextdoor"],
              ["meta_combined", "Meta (IG/FB)"],
              ["pending", "Pending images"],
              ["ready", "Ready"],
              ["posted", "Posted"],
            ] as [FilterChip, string][]).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={filter === key ? "default" : "outline"}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="border rounded-md px-2 py-1 bg-background"
            >
              <option value="scheduled_for">Date</option>
              <option value="post_number">Post #</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((post) => {
              const ch = CHANNEL_META[post.channel];
              const st = STATUS_META[post.status];
              const isExpanded = expanded[post.id];
              const isEditing = editing[post.id] != null;
              const isUploading = uploading[post.id];
              return (
                <Card key={post.id} className="flex flex-col overflow-hidden">
                  {/* Image */}
                  <div className="aspect-square bg-muted relative flex items-center justify-center">
                    {post.image_url ? (
                      <img src={post.image_url} alt={post.title || `Post ${post.post_number}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center text-muted-foreground p-4">
                        <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">No image yet</p>
                      </div>
                    )}
                    <Badge className={cn("absolute top-2 left-2", ch.bg, ch.text, "border-0")}>{ch.label}</Badge>
                    <Badge variant="outline" className={cn("absolute top-2 right-2", st.className)}>{st.label}</Badge>
                  </div>

                  <CardContent className="p-4 flex-1 flex flex-col gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">#{post.post_number} · {formatDateTime(post.scheduled_for)}</div>
                      {post.title && <h3 className="font-semibold mt-1">{post.title}</h3>}
                    </div>

                    {isEditing ? (
                      <Textarea
                        value={editing[post.id]}
                        onChange={(e) => setEditing((s) => ({ ...s, [post.id]: e.target.value }))}
                        rows={10}
                        className="text-sm"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {isExpanded ? post.caption : post.caption.slice(0, 100) + (post.caption.length > 100 ? "…" : "")}
                      </p>
                    )}

                    {!isEditing && post.caption.length > 100 && (
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [post.id]: !isExpanded }))}
                        className="text-xs text-primary hover:underline self-start"
                      >
                        {isExpanded ? "Collapse" : "View full caption"}
                      </button>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-auto pt-2 border-t">
                      <input
                        ref={(el) => (fileInputs.current[post.id] = el)}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(post, f);
                          e.target.value = "";
                        }}
                      />
                      <Button size="sm" variant="outline" onClick={() => fileInputs.current[post.id]?.click()} disabled={isUploading}>
                        {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        <span className="ml-1">{post.image_url ? "Replace" : "Upload"}</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copyCaption(post)}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                      {isEditing ? (
                        <>
                          <Button size="sm" onClick={() => saveCaption(post)}>
                            <Save className="h-3 w-3 mr-1" /> Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing((e) => { const n = { ...e }; delete n[post.id]; return n; })}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setEditing((e) => ({ ...e, [post.id]: post.caption }))}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      )}
                      {post.status !== "scheduled" && post.status !== "posted" && (
                        <Button size="sm" variant="outline" onClick={() => markScheduled(post)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Mark scheduled
                        </Button>
                      )}
                      {post.status !== "posted" && (
                        <Button size="sm" variant="outline" onClick={() => markPosted(post)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Mark posted
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" asChild>
                        <a href={ch.scheduler} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" /> Scheduler
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-12">No posts match this filter.</div>
            )}
          </div>
        ) : (
          // Calendar view
          <div className="space-y-8">
            {monthsToShow.map(({ year, month }) => {
              const monthName = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const cells: (number | null)[] = [];
              for (let i = 0; i < firstDay; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              const todayIso = new Date().toISOString().slice(0, 10);
              return (
                <div key={`${year}-${month}`} className="bg-card rounded-lg border p-4">
                  <h2 className="font-bold text-lg mb-3">{monthName}</h2>
                  <div className="grid grid-cols-7 gap-1 text-xs text-center text-muted-foreground mb-1">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} className="py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((day, i) => {
                      if (day == null) return <div key={i} />;
                      const dateIso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const dayPosts = postsByDay[dateIso] || [];
                      const isToday = dateIso === todayIso;
                      const isSelected = calendarSelectedDay === dateIso;
                      return (
                        <button
                          key={i}
                          onClick={() => setCalendarSelectedDay(dayPosts.length > 0 ? dateIso : null)}
                          className={cn(
                            "min-h-[64px] border rounded p-1 text-left text-xs hover:bg-accent transition",
                            isToday && "ring-2 ring-primary",
                            isSelected && "bg-accent",
                          )}
                        >
                          <div className="font-medium">{day}</div>
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {dayPosts.map((p) => (
                              <span
                                key={p.id}
                                className={cn("inline-block w-2 h-2 rounded-full", CHANNEL_META[p.channel].bg)}
                                title={p.title || `Post ${p.post_number}`}
                              />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {calendarSelectedDay && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-4" onClick={() => setCalendarSelectedDay(null)}>
                <div className="bg-card rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <div className="sticky top-0 bg-card border-b p-4 flex items-center justify-between">
                    <h3 className="font-bold">
                      {new Date(calendarSelectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </h3>
                    <Button size="sm" variant="ghost" onClick={() => setCalendarSelectedDay(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="p-4 space-y-3">
                    {(postsByDay[calendarSelectedDay] || []).map((p) => {
                      const ch = CHANNEL_META[p.channel];
                      const st = STATUS_META[p.status];
                      return (
                        <Card key={p.id}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={cn(ch.bg, ch.text, "border-0")}>{ch.label}</Badge>
                              <Badge variant="outline" className={st.className}>{st.label}</Badge>
                              <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(p.scheduled_for)}</span>
                            </div>
                            {p.title && <div className="font-semibold text-sm">{p.title}</div>}
                            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{p.caption.slice(0, 200)}{p.caption.length > 200 ? "…" : ""}</p>
                            <div className="flex gap-1.5 mt-2">
                              <Button size="sm" variant="outline" onClick={() => copyCaption(p)}>
                                <Copy className="h-3 w-3 mr-1" /> Copy
                              </Button>
                              <Button size="sm" variant="ghost" asChild>
                                <a href={ch.scheduler} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" /> Scheduler
                                </a>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
