// Tidy — Pro on-site job view (/pro/job/:jobId).
//
// B1: before-photos are the gate. A Pro cannot open an add-on request until
// they are uploaded, because a request without evidence is just a sales pitch.
// B2: the Pro picks the condition from the catalog and writes a note. They
// never see or set a price — the server prices it from addon_catalog. Anything
// outside the catalog goes to admin as "Other — needs quote", not to the
// customer.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Camera, Loader2, Check, Clock, X, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { pushEvent } from "@/lib/tracking";

const OTHER = "other_needs_quote";

type Visit = {
  id: string;
  jobber_visit_id: string;
  status: string;
  service_type: string | null;
  scheduled_at: string | null;
  before_photos_count: number;
  before_photos_uploaded_at: string | null;
  started_at: string | null;
};

type CatalogAddon = { id: string; addon_key: string; display_name: string; services: string[] | null };

type RequestRow = {
  id: string;
  addon_name: string;
  status: string;
  amount_cents: number;
  minutes_estimate: number;
  requested_at: string;
};

export default function ProJobView() {
  const { jobId = "" } = useParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [addons, setAddons] = useState<CatalogAddon[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [addonKey, setAddonKey] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data: sessionRes } = await supabase.auth.getSession();
    const uid = sessionRes.session?.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setLoading(false);
      return;
    }
    const [{ data: v }, { data: cat }, { data: reqs }] = await Promise.all([
      supabase
        .from("pro_visits")
        .select("id, jobber_visit_id, status, service_type, scheduled_at, before_photos_count, before_photos_uploaded_at, started_at")
        .eq("jobber_visit_id", jobId)
        .maybeSingle(),
      supabase
        .from("addon_catalog")
        .select("id, addon_key, display_name, services")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("addon_requests")
        .select("id, addon_name, status, amount_cents, minutes_estimate, requested_at")
        .eq("job_id", jobId)
        .order("requested_at", { ascending: false }),
    ]);
    setVisit((v as Visit) ?? null);
    setAddons((cat as CatalogAddon[]) ?? []);
    setRequests((reqs as RequestRow[]) ?? []);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    document.title = "Job | Tidy Pro";
    void load();
  }, [load]);

  const uploadBeforePhotos = async (files: FileList) => {
    if (!userId || !visit) return;
    setUploading(true);
    let uploaded = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/${jobId}/before-${Date.now()}-${uploaded}.${ext}`;
      const { error } = await supabase.storage
        .from("job-condition-photos")
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (!error) uploaded += 1;
    }
    if (uploaded > 0) {
      const count = (visit.before_photos_count ?? 0) + uploaded;
      await supabase
        .from("pro_visits")
        .update({
          before_photos_count: count,
          before_photos_uploaded_at: new Date().toISOString(),
          started_at: visit.started_at ?? new Date().toISOString(),
        })
        .eq("id", visit.id);
      await load();
      toast({ title: `${uploaded} before photo${uploaded > 1 ? "s" : ""} uploaded` });
    } else {
      toast({ title: "Upload failed", description: "Try again on a stronger signal.", variant: "destructive" });
    }
    setUploading(false);
  };

  const uploadConditionPhoto = async (file: File) => {
    if (!userId) return;
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${jobId}/condition-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("job-condition-photos")
      .upload(path, file, { contentType: file.type || "image/jpeg" });
    setUploading(false);
    if (error) {
      toast({ title: "Photo upload failed", variant: "destructive" });
      return;
    }
    setPhotoPath(path);
  };

  const submitRequest = async () => {
    if (!addonKey || !photoPath) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("request-addon", {
      body: { job_id: jobId, addon_key: addonKey, condition_note: note.trim() || undefined, photo_path: photoPath },
    });
    setSending(false);
    if (error || !data?.ok) {
      toast({
        title: "Couldn't send the request",
        description: (data as { error?: string } | null)?.error ?? "Try again.",
        variant: "destructive",
      });
      return;
    }
    pushEvent("addon_requested", { addon_key: addonKey, needs_quote: addonKey === OTHER });
    toast({
      title: data.status === "needs_quote" ? "Sent to the office for a quote" : "Sent to the customer",
      description: data.status === "needs_quote"
        ? "Keep working the booked scope. We'll call you."
        : "Keep working. You'll get an answer within 15 minutes.",
    });
    setAddonKey("");
    setNote("");
    setPhotoPath(null);
    await load();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="min-h-screen bg-background px-5 py-16 text-center">
        <p className="text-muted-foreground">Sign in to view this job.</p>
        <Link to="/login" className="mt-4 inline-block font-semibold text-primary">Sign in</Link>
      </main>
    );
  }

  if (!visit) {
    return (
      <main className="min-h-screen bg-background px-5 py-16 text-center">
        <p className="text-muted-foreground">We couldn't find that job on your schedule.</p>
        <Link to="/pro" className="mt-4 inline-block font-semibold text-primary">Back to my jobs</Link>
      </main>
    );
  }

  const gateOpen = Boolean(visit.before_photos_uploaded_at);
  const pending = requests.find((r) => r.status === "pending");
  const service = (visit.service_type ?? "").toLowerCase();
  const relevant = addons.filter((a) => {
    if (!service) return true;
    const s = a.services ?? [];
    return s.length === 0 || s.some((x) => service.includes(x) || x.includes(service));
  });

  return (
    <main className="min-h-screen bg-background px-5 py-6">
      <div className="mx-auto w-full max-w-md">
        <Link to="/pro" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> My jobs
        </Link>

        <h1 className="text-2xl font-semibold text-foreground">
          {visit.service_type ?? "Visit"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {visit.scheduled_at
            ? new Date(visit.scheduled_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
            : "Time to be confirmed"}
          {" · "}{visit.status}
        </p>

        {/* B1 — before photos gate */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">Before photos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {gateOpen
              ? `${visit.before_photos_count} uploaded. You're clear to work.`
              : "Upload these first. They're required before you can flag anything."}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadBeforePhotos(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" aria-hidden />}
            {gateOpen ? "Add more photos" : "Take before photos"}
          </button>
        </section>

        {/* B2 — walkaround request */}
        <section className="mt-5 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">Found something extra?</h2>

          {!gateOpen && (
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your before photos first.
            </p>
          )}

          {gateOpen && pending && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 p-4 text-sm">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-foreground">
                <span className="font-medium">{pending.addon_name}</span> is waiting on the customer.
                Keep working the booked scope — we'll tell you either way.
              </p>
            </div>
          )}

          {gateOpen && !pending && (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-foreground">What did you find?</span>
                <select
                  value={addonKey}
                  onChange={(e) => setAddonKey(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-3 text-base text-foreground"
                >
                  <option value="">Choose one…</option>
                  {relevant.map((a) => (
                    <option key={a.id} value={a.addon_key}>{a.display_name}</option>
                  ))}
                  <option value={OTHER}>Other — needs a quote</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  Note for the customer <span className="text-muted-foreground">(plain language)</span>
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 400))}
                  rows={3}
                  placeholder="Heavy pet hair on the back seats and floor mats."
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-3 text-base text-foreground"
                />
              </label>

              <div>
                <span className="text-sm font-medium text-foreground">Photo of the condition</span>
                <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-input px-4 py-3.5 text-sm font-medium text-foreground">
                  {photoPath
                    ? <><Check className="h-4 w-4 text-primary" aria-hidden /> Photo attached</>
                    : <><Camera className="h-4 w-4" aria-hidden /> Take a photo</>}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadConditionPhoto(e.target.files[0])}
                  />
                </label>
              </div>

              <p className="text-[13px] leading-relaxed text-muted-foreground">
                You don't set the price — Tidy prices it and asks the customer. Never quote a
                number on site, and never start the work before it's approved.
              </p>

              <button
                type="button"
                onClick={submitRequest}
                disabled={!addonKey || !photoPath || sending || uploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send to Tidy
              </button>
            </div>
          )}
        </section>

        {requests.length > 0 && (
          <section className="mt-5 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">This visit's requests</h2>
            <ul className="mt-3 space-y-3">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">{r.addon_name}</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {r.status === "approved" && <Check className="h-4 w-4 text-primary" aria-hidden />}
                    {(r.status === "declined" || r.status === "expired") && <X className="h-4 w-4" aria-hidden />}
                    {r.status === "pending" && <Clock className="h-4 w-4" aria-hidden />}
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
