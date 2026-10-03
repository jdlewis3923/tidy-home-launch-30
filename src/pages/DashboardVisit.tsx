import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, CheckCircle2 } from "lucide-react";
import DashboardTopNav from "@/components/dashboard/DashboardTopNav";
import RouteFallback from "@/components/RouteFallback";
import RedoButton from "@/components/dashboard/RedoButton";
import { supabase } from "@/integrations/supabase/client";
import { formatLongDate, serviceLabel, useDashboardData } from "@/lib/dashboard-data";
import { useLanguage } from "@/contexts/LanguageContext";

type Photo = { id: string; kind: "before" | "after"; uploaded_at: string; url: string };

export default function DashboardVisit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const dashboard = useDashboardData();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const visit = useMemo(() => dashboard.visits.find((row) => row.id === id) ?? null, [dashboard.visits, id]);

  useEffect(() => {
    if (!dashboard.loading && !dashboard.isAuthed) navigate("/login", { replace: true });
  }, [dashboard.loading, dashboard.isAuthed, navigate]);

  useEffect(() => {
    if (!id || visit?.status !== "complete") return;
    let cancelled = false;
    void supabase.functions.invoke("customer-visit-photos", { body: { visit_id: id } }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || data?.ok === false) {
        setPhotoError(true);
        setPhotos([]);
        return;
      }
      setPhotos((data?.photos ?? []) as Photo[]);
    });
    return () => { cancelled = true; };
  }, [id, visit?.status]);

  if (dashboard.loading) return <RouteFallback />;
  if (!dashboard.isAuthed) return null;

  if (!visit) {
    return (
      <div className="min-h-screen bg-cream text-ink">
        <DashboardTopNav initials={dashboard.initials} />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-ink-soft">{t("We couldn't find that visit.")}</p>
          <Link to="/dashboard/schedule" className="mt-4 inline-flex items-center gap-2 font-semibold text-[hsl(var(--primary))]">
            <ArrowLeft className="h-4 w-4" /> {t("Back to schedule")}
          </Link>
        </main>
      </div>
    );
  }

  const before = (photos ?? []).filter((photo) => photo.kind === "before");
  const after = (photos ?? []).filter((photo) => photo.kind === "after");

  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashboardTopNav initials={dashboard.initials} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link to="/dashboard/schedule" className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]">
          <ArrowLeft className="h-4 w-4" /> {t("Back to schedule")}
        </Link>
        <header className="mt-6 flex flex-col gap-3 border-b border-[hsl(var(--hairline))] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--primary))]">{t("Visit record")}</p>
            <h1 className="mt-1 text-3xl font-black">{serviceLabel(visit.service)}</h1>
            <p className="mt-1 text-sm text-ink-soft">{formatLongDate(visit.visit_date)}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> {t(visit.status === "complete" ? "Completed" : "Scheduled")}
          </span>
        </header>

        {visit.status === "complete" && (
          <section className="py-7">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-[hsl(var(--primary))]" />
              <h2 className="text-xl font-bold">{t("Photo verification")}</h2>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{t("Before-and-after photos from this visit.")}</p>
            {photos === null ? (
              <div className="mt-5 h-48 animate-pulse rounded-lg bg-white" />
            ) : photoError ? (
              <p className="mt-5 rounded-lg border border-[hsl(var(--hairline))] bg-white p-4 text-sm text-ink-soft">
                {t("Photo proof is temporarily unavailable. Please try again.")}
              </p>
            ) : (
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                {(["before", "after"] as const).map((kind) => {
                  const group = kind === "before" ? before : after;
                  return (
                    <div key={kind}>
                      <h3 className="mb-2 text-xs font-bold uppercase text-ink-soft">{t(kind === "before" ? "Before" : "After")}</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {group.map((photo) => (
                          <img key={photo.id} src={photo.url} alt={t(`${kind} service photo`)} className="aspect-square w-full rounded-lg object-cover" />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {visit.status === "complete" && visit.completed_at && (
          <RedoButton visitId={visit.id} completedAt={visit.completed_at} />
        )}
      </main>
    </div>
  );
}