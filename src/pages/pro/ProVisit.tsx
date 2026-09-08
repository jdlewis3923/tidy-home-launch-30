/**
 * Visit detail — /pro/visit/:id
 * Action stack: On my way -> Upload photos -> Complete visit.
 * Complete stays disabled until at least one before and one after photo exist;
 * the same rule is re-checked server-side before anything is stamped.
 * The map is a static, informational preview: no tracking, no location dot.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, ListChecks, Send } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import {
  ErrorState, InfoRow, MapPreview, ProButton, ProCard, Skeleton, StatusPill,
} from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { VISIT_KIND_LABEL, dayLabel, timeWindow, visitAction } from "@/lib/pro-portal";
import { SERVICE_LABEL, money } from "@/lib/pro-pay";

export default function ProVisit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { visits, coi, loading, error, reload } = useProSession();
  const visit = useMemo(() => visits.find((v) => v.id === id) ?? null, [visits, id]);

  const [busy, setBusy] = useState<null | "omw" | "complete">(null);
  const [omwSent, setOmwSent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (visit?.on_my_way_at) setOmwSent(true);
  }, [visit?.on_my_way_at]);

  const photosOk = (visit?.before_photos ?? 0) > 0 && (visit?.after_photos ?? 0) > 0;
  const blocked = !coi?.can_work;

  const onMyWay = async () => {
    if (!visit) return;
    setBusy("omw");
    setActionError(null);
    const res = await visitAction(visit.id, "on_my_way");
    setBusy(null);
    if (!res.ok) {
      setActionError(
        res.error === "coi_blocked"
          ? "Your insurance certificate must be valid before you start a visit."
          : "Couldn't send your on-my-way message.",
      );
      return;
    }
    setOmwSent(true);
    reload();
  };

  const complete = async () => {
    if (!visit) return;
    setBusy("complete");
    setActionError(null);
    const res = await visitAction(visit.id, "complete");
    setBusy(null);
    setConfirm(false);
    if (!res.ok) {
      setActionError(
        res.error === "photos_required"
          ? "Add at least one before photo and one after photo first."
          : res.error === "coi_blocked"
            ? "Your insurance certificate must be valid before you complete a visit."
            : "Couldn't complete this visit.",
      );
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      reload();
      navigate("/pro/schedule");
    }, 1200);
  };

  if (loading) {
    return (
      <ProShell title="Visit" back="/pro/schedule">
        <div className="space-y-5 px-[18px] py-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
        </div>
      </ProShell>
    );
  }

  if (error || !visit) {
    return (
      <ProShell title="Visit" back="/pro/schedule">
        <ErrorState title="Couldn't load this visit" onRetry={reload} />
      </ProShell>
    );
  }

  if (success) {
    return (
      <ProShell title="Visit complete" back="/pro/schedule" nav={false}>
        <div className="flex flex-col items-center px-8 py-20 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[hsl(var(--pro-green-soft))]">
            <Check className="h-8 w-8 text-[hsl(var(--pro-green))]" aria-hidden />
          </span>
          <p className="mt-4 text-[18px] font-extrabold text-[hsl(var(--pro-ink))]">
            Visit complete — {money(visit.visit_pay_cents)} added to this week's earnings.
          </p>
        </div>
      </ProShell>
    );
  }

  return (
    <ProShell title={SERVICE_LABEL[visit.service_type ?? ""] ?? "Visit"} back="/pro/schedule">
      <div className="bg-white px-4 pb-4 pt-4">
        <p className="text-[14px] font-semibold text-[hsl(var(--pro-ink-soft))]">
          {dayLabel(visit.scheduled_start)}
        </p>
        <p className="text-[16px] font-bold text-[hsl(var(--pro-ink))]">
          {timeWindow(visit.scheduled_start, visit.scheduled_end)}
        </p>
        <div className="mt-3 flex items-end justify-between">
          <p className="text-[34px] font-extrabold leading-none text-[hsl(var(--pro-ink))]">
            {money(visit.visit_pay_cents)}
          </p>
          <div className="flex gap-2">
            {visit.visit_kind && VISIT_KIND_LABEL[visit.visit_kind] && (
              <StatusPill tone="blue">{VISIT_KIND_LABEL[visit.visit_kind]}</StatusPill>
            )}
            {visit.is_sample && <StatusPill tone="neutral">Sample</StatusPill>}
            {visit.completed_at ? (
              <StatusPill tone="green">Completed</StatusPill>
            ) : omwSent ? (
              <StatusPill tone="blue">On my way</StatusPill>
            ) : (
              <StatusPill tone="neutral">Scheduled</StatusPill>
            )}
          </div>
        </div>
        <p className="mt-1 text-[13px] text-[hsl(var(--pro-ink-soft))]">Flat pay for this completed visit</p>
      </div>

      <MapPreview street={visit.street} zip={visit.zip} />

      <div className="p-4">
        <ProCard>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
            Customer
          </p>
          <p className="text-[18px] font-bold text-[hsl(var(--pro-ink))]">
            {visit.customer_first_name ?? "—"}
          </p>
          <p className="mt-2 text-[17px] font-bold text-[hsl(var(--pro-ink))]">{visit.street ?? "—"}</p>
          <p className="text-[15px] text-[hsl(var(--pro-ink-soft))]">{visit.zip ?? ""}</p>
        </ProCard>

        <ProCard className="mt-3">
          <p className="pb-1 text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
            Access details
          </p>
          {visit.access_notes && <InfoRow kind="access" label="Access" value={visit.access_notes} />}
          {visit.gate_code && <InfoRow kind="gate" label="Gate code" value={visit.gate_code} />}
          {visit.pet_notes && <InfoRow kind="pet" label="Pets" value={visit.pet_notes} />}
          {visit.parking_notes && <InfoRow kind="parking" label="Parking" value={visit.parking_notes} />}
          {!visit.access_notes && !visit.gate_code && !visit.pet_notes && !visit.parking_notes && (
            <p className="py-2 text-[14px] text-[hsl(var(--pro-ink-soft))]">
              No access notes on this visit.
            </p>
          )}
        </ProCard>

        <Link
          to={`/pro/visit/${visit.id}/checklist`}
          className="mt-3 flex min-h-[52px] items-center gap-3 rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white px-4"
        >
          <ListChecks className="h-5 w-5 text-[hsl(var(--pro-blue))]" aria-hidden />
          <span className="flex-1 text-[15px] font-bold text-[hsl(var(--pro-ink))]">View checklist</span>
        </Link>

        {actionError && (
          <p className="mt-4 rounded-xl bg-[hsl(var(--pro-red-soft))] p-3 text-[14px] font-semibold text-[hsl(var(--pro-red))]">
            {actionError}
          </p>
        )}

        <div className="mt-5 space-y-3">
          <ProButton
            full
            disabled={busy !== null || omwSent || blocked || !!visit.completed_at}
            onClick={() => void onMyWay()}
          >
            {omwSent ? (
              <>
                <Check className="h-4 w-4" aria-hidden /> Customer notified
              </>
            ) : (
              <>
                <Send className={`h-4 w-4 ${busy === "omw" ? "pro-plane" : ""}`} aria-hidden /> On my way
              </>
            )}
          </ProButton>

          <Link
            to={`/pro/visit/${visit.id}/photos`}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border-2 border-[hsl(var(--pro-blue))] bg-white text-[15px] font-semibold text-[hsl(var(--pro-blue))]"
          >
            Upload photos ({visit.before_photos ?? 0} before · {visit.after_photos ?? 0} after)
          </Link>

          <ProButton
            full
            variant="secondary"
            disabled={!photosOk || blocked || busy !== null || !!visit.completed_at}
            onClick={() => setConfirm(true)}
          >
            Complete visit
          </ProButton>
          {!photosOk && !visit.completed_at && (
            <p className="text-center text-[13px] text-[hsl(var(--pro-ink-soft))]">
              One before photo and one after photo are required.
            </p>
          )}
          {blocked && (
            <p className="text-center text-[13px] font-semibold text-[hsl(var(--pro-amber))]">
              Visit actions are paused until a valid certificate of insurance is on file.
            </p>
          )}
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setConfirm(false)}>
          <div
            className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[18px] font-extrabold text-[hsl(var(--pro-ink))]">Complete this visit?</p>
            <ul className="mt-3 space-y-2 text-[15px] text-[hsl(var(--pro-ink))]">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[hsl(var(--pro-green))]" aria-hidden /> Photos added
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[hsl(var(--pro-green))]" aria-hidden /> Checklist reviewed
              </li>
            </ul>
            <ProButton full className="mt-5" disabled={busy === "complete"} onClick={() => void complete()}>
              {busy === "complete" ? "Completing…" : "Yes, complete visit"}
            </ProButton>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="mt-2 min-h-[44px] w-full text-[14px] font-bold text-[hsl(var(--pro-ink-soft))]"
            >
              Not yet
            </button>
          </div>
        </div>
      )}
    </ProShell>
  );
}
