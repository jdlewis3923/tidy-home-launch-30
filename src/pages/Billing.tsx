/**
 * /billing — Calm billing center.
 *
 * Shows a quick local summary (next charge, plan total, recent invoices)
 * AND offers a "Open billing portal" CTA that hands off to Stripe. While
 * the portal session mints, we show a calm 3-dot bouncing loader so the
 * user knows the system is responding — no spinners, no alarms.
 */
import { Navigate, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CreditCard,
  ReceiptText,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  PauseCircle,
  PlayCircle,
  XCircle,
} from "lucide-react";
import {
  CUSTOMER_ACCOUNT_ENABLED,
  STRIPE_INTEGRATION_ENABLED,
} from "@/lib/dashboard-config";
import {
  STRIPE_FUNCTIONS,
  getBillingReturnUrl,
} from "@/lib/stripe-config";
import { supabase } from "@/integrations/supabase/client";
import DashboardTopNav from "@/components/dashboard/DashboardTopNav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Tables } from "@/integrations/supabase/types";
import {
  useDashboardData,
  formatLongDate,
  formatMoney,
} from "@/lib/dashboard-data";


export default function Billing() {
  const navigate = useNavigate();
  const data = useDashboardData();
  const { t } = useLanguage();
  const [portalState, setPortalState] = useState<"idle" | "loading" | "error">("idle");
  const [subOverride, setSubOverride] = useState<Tables<"subscriptions"> | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseDays, setPauseDays] = useState("30");
  const [busy, setBusy] = useState(false);


  useEffect(() => {
    if (!data.loading && !data.isAuthed) {
      navigate("/login", { replace: true });
    }
  }, [data.loading, data.isAuthed, navigate]);

  if (!CUSTOMER_ACCOUNT_ENABLED) return <Navigate to="/" replace />;

  const openPortal = async () => {
    if (!STRIPE_INTEGRATION_ENABLED) {
      setPortalState("error");
      return;
    }
    setPortalState("loading");
    try {
      const { data: res, error } = await supabase.functions.invoke(
        STRIPE_FUNCTIONS.CREATE_PORTAL_SESSION,
        { body: { return_url: getBillingReturnUrl() } }
      );
      if (error) throw error;
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setPortalState("error");
      }
    } catch {
      setPortalState("error");
    }
  };

  const refetchSub = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return;
    const { data: row } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row) setSubOverride(row);
  };

  const manage = async (
    action: "cancel" | "undo_cancel" | "pause" | "resume",
    resumeOn?: string
  ) => {
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        "customer-subscription-manage",
        { body: resumeOn ? { action, resume_on: resumeOn } : { action } }
      );
      if (error) throw error;
      if (res && res.ok === false) throw new Error(res.error ?? "failed");

      // Pause restart date lives on public.subscriptions.paused_until (synced from
      // Stripe) — never in localStorage, so it survives across devices.


      toast.success(
        action === "cancel"
          ? t("Your plan will not renew.")
          : action === "undo_cancel"
          ? t("Your plan is staying active.")
          : action === "pause"
          ? t("Your plan is paused.")
          : t("Your plan is active again.")
      );
      setCancelOpen(false);
      setPauseOpen(false);
      await refetchSub();
    } catch {
      toast.error(t("We couldn't update your plan. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (data.loading) {
    return (
      <div className="min-h-screen bg-cream">
        <DashboardTopNav />
        <BillingLoader label="loading your billing" />
      </div>
    );
  }

  if (!data.isAuthed) return null;

  const sub = subOverride ?? data.subscription;
  // Server value is the source of truth for the pause restart date.
  const pausedUntil = sub?.paused_until ? sub.paused_until.slice(0, 10) : null;
  const invoices = data.invoices.slice(0, 6);
  const isPaused = sub?.status === "paused" || !!sub?.pause_collection;
  const isCanceling = !!sub?.cancel_at_period_end;
  const resumeDateFor = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };


  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashboardTopNav initials={data.initials} />

      <section className="mx-auto max-w-[1100px] px-6 pt-10 pb-16">
        <div className="animate-calm-in">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            billing
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
            <span className="text-ink">payments,</span>{" "}
            <span className="text-[hsl(var(--primary))]">on autopilot.</span>
          </h1>
          <p className="mt-3 text-base text-ink-soft">
            Your card is charged monthly, on the same date you started. No surprises, ever.
          </p>
        </div>

        {/* Top summary */}
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
                <CreditCard className="h-4 w-4 text-[hsl(var(--primary))]" />
                Next charge
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                {sub?.status === "active" ? "On track" : "—"}
              </span>
            </div>
            <div className="mt-5 flex items-end justify-between">
              <div>
                {sub?.next_billing_date ? (
                  <>
                    <p className="text-3xl font-black text-ink">
                      {formatMoney(sub.monthly_total_cents)}
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {`on ${formatLongDate(sub.next_billing_date)}`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-black text-ink">—</p>
                    <p className="mt-1 text-sm text-ink-soft">no upcoming charge</p>
                  </>
                )}
                {sub?.card_last4 && (
                  <p className="mt-2 text-xs text-ink-faint">
                    {(sub.card_brand ?? "Card").replace(/^./, (c) => c.toUpperCase())} ····{" "}
                    {sub.card_last4}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={openPortal}
                disabled={portalState === "loading"}
                className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_hsl(var(--primary)/0.55)] transition hover:opacity-95 disabled:opacity-70"
              >
                {portalState === "loading" ? (
                  <>
                    opening
                    <BouncingDots tone="light" />
                  </>
                ) : (
                  <>
                    Update payment method
                    <ExternalLink className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
            {portalState === "error" && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-rose-600">
                <AlertCircle className="h-3 w-3" /> Portal is temporarily
                unavailable. Try again in a moment.
              </p>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-ink">Plan</h2>
            <p className="mt-3 text-2xl font-black text-ink">
              {sub ? `${sub.services.length} ${sub.services.length === 1 ? "service" : "services"}` : "—"}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {sub
                ? `${sub.frequency} visits · ${formatMoney(sub.monthly_total_cents)}/month`
                : "no plan yet"}
            </p>

            {(isPaused || isCanceling) && (
              <span className="mt-3 inline-flex rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                {isPaused
                  ? pausedUntil
                    ? `${t("Paused until")} ${formatLongDate(pausedUntil)}`
                    : t("Paused")
                  : t("Cancels at period end")}
              </span>
            )}

            <Link
              to="/billing"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
            >
              Manage plan <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/dashboard/services#add-service"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
            >
              {t("Add a service")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <p className="mt-2 text-xs text-ink-faint">
              {t("Two or more services earns one free premium add-on every month.")}
            </p>

            {sub && (
              <div className="mt-5 border-t border-[hsl(var(--hairline))] pt-4">
                <h3 className="text-sm font-bold text-ink">{t("Manage subscription")}</h3>
                <div className="mt-3 flex flex-col gap-2">
                  {isPaused ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => manage("resume")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--hairline))] bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-cream disabled:opacity-70"
                    >
                      <PlayCircle className="h-4 w-4 text-[hsl(var(--primary))]" />
                      {t("Resume plan")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPauseOpen(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--hairline))] bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-cream disabled:opacity-70"
                    >
                      <PauseCircle className="h-4 w-4 text-[hsl(var(--primary))]" />
                      {t("Pause plan")}
                    </button>
                  )}

                  {isCanceling ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => manage("undo_cancel")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--hairline))] bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-cream disabled:opacity-70"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {t("Keep my plan")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setCancelOpen(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--hairline))] bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-cream disabled:opacity-70"
                    >
                      <XCircle className="h-4 w-4 text-ink-faint" />
                      {t("Cancel plan")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>


        {/* Invoices */}
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <ReceiptText className="h-4 w-4 text-[hsl(var(--primary))]" />
              Recent invoices
            </h2>
            <span className="text-xs text-ink-faint">
              {invoices.length === 0 ? "no invoices yet" : `${invoices.length} of ${data.invoices.length}`}
            </span>
          </div>

          {invoices.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[hsl(var(--hairline))] bg-cream/50 p-8 text-center">
              <p className="text-sm text-ink-soft">
                Your first invoice will appear here after your next visit.
              </p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[hsl(var(--hairline))]/70">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-cream">
                      {inv.status === "paid" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : inv.status === "failed" ? (
                        <AlertCircle className="h-4 w-4 text-rose-600" />
                      ) : (
                        <Clock className="h-4 w-4 text-ink-faint" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {formatLongDate(inv.invoice_date)}
                      </p>
                      <p className="text-xs capitalize text-ink-soft">
                        {inv.status}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-ink">
                      {formatMoney(inv.amount_cents)}
                    </span>
                    {inv.receipt_url && (
                      <a
                        href={inv.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                      >
                        Receipt
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Cancel your Tidy plan?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Your plan stays active until the end of the period you have already paid for, then it will not renew. You can undo this any time before then."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Keep my plan")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                manage("cancel");
              }}
            >
              {t("Yes, cancel my plan")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Pause your plan")}</DialogTitle>
            <DialogDescription>
              {t("We hold your slot while you are paused. No charges while paused.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {t("Resume on")}
            </p>
            <Select value={pauseDays} onValueChange={setPauseDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[14, 30, 45, 60].map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {formatLongDate(resumeDateFor(d))} · {d} {t("days")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <button
              type="button"
              disabled={busy}
              onClick={() => manage("pause", resumeDateFor(Number(pauseDays)))}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_hsl(var(--primary)/0.55)] transition hover:opacity-95 disabled:opacity-70"
            >
              {t("Pause plan")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/* — Bouncing dots loader — calm, three-dot wave —————————————————— */

function BouncingDots({ tone = "primary" }: { tone?: "primary" | "light" }) {
  const dot =
    tone === "light"
      ? "bg-white"
      : "bg-[hsl(var(--primary))]";
  return (
    <span className="inline-flex items-end gap-1" aria-hidden>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} animate-billing-bounce`} style={{ animationDelay: "0ms" }} />
      <span className={`h-1.5 w-1.5 rounded-full ${dot} animate-billing-bounce`} style={{ animationDelay: "140ms" }} />
      <span className={`h-1.5 w-1.5 rounded-full ${dot} animate-billing-bounce`} style={{ animationDelay: "280ms" }} />
    </span>
  );
}

function BillingLoader({ label }: { label: string }) {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col items-center px-6 py-24 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-[0_4px_20px_rgba(15,23,42,0.06)]">
        <CreditCard className="h-6 w-6 text-[hsl(var(--primary))]" />
      </div>
      <p className="mt-6 text-sm font-medium text-ink">{label}</p>
      <div className="mt-3">
        <BouncingDots />
      </div>
      <p className="mt-2 text-xs text-ink-faint">one moment.</p>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[hsl(var(--hairline))] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}
