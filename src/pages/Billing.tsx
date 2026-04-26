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
import {
  CreditCard,
  ReceiptText,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
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
  useDashboardData,
  formatLongDate,
  formatMoney,
} from "@/lib/dashboard-data";

export default function Billing() {
  const navigate = useNavigate();
  const data = useDashboardData();
  const [portalState, setPortalState] = useState<"idle" | "loading" | "error">("idle");

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

  if (data.loading) {
    return (
      <div className="min-h-screen bg-cream">
        <DashboardTopNav />
        <BillingLoader label="loading your billing" />
      </div>
    );
  }

  if (!data.isAuthed) return null;

  const sub = data.subscription;
  const invoices = data.invoices.slice(0, 6);

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
            Your card is charged after each visit. No surprises, ever.
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
                <p className="text-3xl font-black text-ink">
                  {formatMoney(sub?.monthly_total_cents)}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {sub?.next_billing_date
                    ? `on ${formatLongDate(sub.next_billing_date)}`
                    : "no upcoming charge"}
                </p>
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
            <p className="mt-1 text-sm capitalize text-ink-soft">
              {sub?.frequency ?? "no plan yet"}
            </p>
            <Link
              to="/dashboard/plan"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
            >
              Manage plan <ArrowRight className="h-3.5 w-3.5" />
            </Link>
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
