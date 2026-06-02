/**
 * Pro Equipment — /pro/equipment
 *
 * Contractor uploads one photo per required equipment item. Files go to the
 * private `contractor-equipment-photos` bucket at path `{applicant_id}/{item_key}-{ts}.jpg`,
 * and a row is inserted into `applicant_equipment_photos` (status defaults
 * to 'pending'). Admin review approves/rejects each photo; once every
 * required item has at least one 'approved' row, an edge function flips
 * applicants.equipment_approved = true.
 *
 * Re-upload after rejection: contractor just uploads again — a new pending
 * row supersedes the previous rejected one in the display.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Upload, CheckCircle2, Clock, XCircle, Loader2, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getRequiredItems, type EquipmentItem } from "@/lib/equipmentChecklist";
import tidyLogo from "@/assets/tidy-logo.png";

type PhotoRow = {
  id: string;
  photo_type: string;
  storage_path: string;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
};

export default function ProEquipment() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const refresh = useCallback(async (aid: string) => {
    const { data } = await supabase.from("applicant_equipment_photos")
      .select("id, photo_type, storage_path, status, notes, created_at")
      .eq("applicant_id", aid)
      .order("created_at", { ascending: false });
    setPhotos((data as PhotoRow[]) ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) { setAuthed(false); return; }
      setAuthed(true);
      const { data, error } = await supabase.from("applicants")
        .select("id, service").eq("contractor_id", user.id).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Could not load your applicant profile");
        setLoading(false); return;
      }
      setApplicantId(data.id);
      setService(data.service);
      await refresh(data.id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  const required: EquipmentItem[] = useMemo(() => getRequiredItems(service), [service]);

  // Map of photo_type -> latest row.
  const latestByType = useMemo(() => {
    const m: Record<string, PhotoRow> = {};
    for (const p of photos) {
      if (!m[p.photo_type]) m[p.photo_type] = p;
    }
    return m;
  }, [photos]);

  const attemptCount = (key: string) => photos.filter((p) => p.photo_type === key).length;

  const handleUpload = async (item: EquipmentItem, file: File) => {
    if (!applicantId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file."); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large (max 10 MB)."); return;
    }
    setUploadingKey(item.key);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${applicantId}/${item.key}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("contractor-equipment-photos")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setUploadingKey(null);
      toast.error("Upload failed", { description: upErr.message }); return;
    }
    const { error: insErr } = await supabase.from("applicant_equipment_photos").insert({
      applicant_id: applicantId,
      photo_type: item.key,
      storage_path: path,
      status: "pending",
    });
    setUploadingKey(null);
    if (insErr) {
      toast.error("Could not save photo record", { description: insErr.message }); return;
    }
    toast.success(`${item.label} uploaded — pending review`);
    await refresh(applicantId);
  };

  if (authed === false) return <Navigate to="/login?next=/pro/equipment" replace />;

  const approvedCount = required.filter((r) => latestByType[r.key]?.status === "approved").length;

  return (
    <div className="min-h-screen bg-white text-navy">
      <Helmet><title>Equipment Photos — Tidy Pro</title></Helmet>

      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/pro/onboarding" className="flex items-center gap-2 text-sm text-slate-500 hover:text-navy">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <img src={tidyLogo} alt="Tidy" className="h-8 w-auto" />
          <span className="text-xs font-semibold text-primary">Equipment</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">Step 3 of 3</p>
        <h1 className="font-display text-3xl font-bold mt-2">Equipment photos</h1>
        <p className="mt-2 text-slate-600 text-sm">
          Photograph each required item. Tidy reviews within 24 hours.
          {required.length > 0 && (
            <> {approvedCount} of {required.length} approved.</>
          )}
        </p>

        {loading ? (
          <div className="mt-8 text-slate-400 text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : required.length === 0 ? (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            We can't determine which equipment you need — contact Tidy support so we can
            update your applicant profile.
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {required.map((item) => {
              const latest = latestByType[item.key];
              const attempts = attemptCount(item.key);
              const flagged = attempts >= 3 && latest?.status !== "approved";
              const isUploading = uploadingKey === item.key;
              return (
                <div key={item.key} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <StatusIcon status={latest?.status} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-navy">{item.label}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>

                      {latest?.status === "rejected" && (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs">
                          <strong className="text-red-700">Rejected:</strong>{" "}
                          <span className="text-red-900">{latest.notes || "Please re-upload."}</span>
                        </div>
                      )}
                      {latest?.status === "pending" && (
                        <p className="mt-2 text-xs text-amber-700">In review — usually within 24 hours.</p>
                      )}
                      {latest?.status === "approved" && (
                        <p className="mt-2 text-xs text-emerald-700">Approved.</p>
                      )}
                      {flagged && (
                        <p className="mt-2 text-xs text-red-700 font-semibold">
                          3+ attempts — flagged for manual review.
                        </p>
                      )}

                      {latest?.status !== "approved" && (
                        <div className="mt-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              disabled={isUploading}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUpload(item, f);
                                e.currentTarget.value = "";
                              }}
                            />
                            <span className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-deep transition">
                              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                              {latest ? "Re-upload" : "Upload photo"}
                            </span>
                          </label>
                          {attempts > 0 && (
                            <span className="ml-2 text-[11px] text-slate-400">
                              {attempts} attempt{attempts === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusIcon({ status }: { status?: "pending" | "approved" | "rejected" }) {
  if (status === "approved") return <CheckCircle2 className="h-6 w-6 text-emerald-600 mt-0.5" />;
  if (status === "rejected") return <XCircle className="h-6 w-6 text-red-600 mt-0.5" />;
  if (status === "pending") return <Clock className="h-6 w-6 text-amber-500 mt-0.5" />;
  return <Camera className="h-6 w-6 text-slate-400 mt-0.5" />;
}
