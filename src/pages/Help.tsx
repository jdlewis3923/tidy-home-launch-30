/**
 * /help — Calm help center.
 *
 * Single page with three pillars: contact (text/email), common questions,
 * and quick-action shortcuts back into the dashboard. No tickets, no
 * forms — Tidy answers via human channels.
 */
import { Navigate, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  MessageSquare,
  Mail,
  Phone,
  HelpCircle,
  Calendar,
  CreditCard,
  KeyRound,
  ChevronDown,
  ArrowRight,
  Clock,
} from "lucide-react";
import { CUSTOMER_ACCOUNT_ENABLED } from "@/lib/dashboard-config";
import DashboardTopNav from "@/components/dashboard/DashboardTopNav";
import { useDashboardData } from "@/lib/dashboard-data";

const FAQ = [
  {
    q: "How do I reschedule a visit?",
    a: "Open the next visit on your dashboard and tap Reschedule, or text us at (786) 829-1141. We confirm within an hour.",
  },
  {
    q: "When will I be charged?",
    a: "Your card is charged after each completed visit. The Billing page shows the next scheduled charge and full invoice history.",
  },
  {
    q: "Can I pause my plan?",
    a: "Yes — pause anytime from Manage Plan. We hold your slot for up to 60 days, no fees.",
  },
  {
    q: "What if no one is home?",
    a: "Most customers leave a gate code or a hidden key. Add yours under Account → Access & Pets so the crew has what they need.",
  },
  {
    q: "Do you bring your own supplies?",
    a: "Yes — every crew arrives fully equipped. If you prefer specific products, leave a note and we'll honor it.",
  },
  {
    q: "Are you insured?",
    a: "Fully licensed and insured in Florida. Every crew member is background-checked before their first visit.",
  },
];

const QUICK = [
  { label: "Reschedule a visit", to: "/dashboard", icon: Calendar },
  { label: "View billing", to: "/billing", icon: CreditCard },
  { label: "Update access", to: "/account", icon: KeyRound },
];

export default function Help() {
  const navigate = useNavigate();
  const data = useDashboardData();
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  if (!CUSTOMER_ACCOUNT_ENABLED) return <Navigate to="/" replace />;

  if (!data.loading && !data.isAuthed) {
    navigate("/login", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashboardTopNav initials={data.initials} />

      <section className="mx-auto max-w-[1100px] px-6 pt-10 pb-16">
        <div className="animate-calm-in">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            help center
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
            <span className="text-ink">we're</span>{" "}
            <span className="text-[hsl(var(--primary))]">always one tap away.</span>
          </h1>
          <p className="mt-3 text-base text-ink-soft">
            Real humans, fast answers. Pick the easiest channel below.
          </p>
        </div>

        {/* Contact channels */}
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <ContactCard
            icon={<MessageSquare className="h-5 w-5" />}
            label="Text us"
            value="(305) 555-1234"
            href="sms:+13055551234"
            note="Avg reply: 8 min"
            primary
          />
          <ContactCard
            icon={<Mail className="h-5 w-5" />}
            label="Email"
            value="hello@jointidy.co"
            href="mailto:hello@jointidy.co"
            note="Same-day response"
          />
          <ContactCard
            icon={<Phone className="h-5 w-5" />}
            label="Call"
            value="(305) 555-1234"
            href="tel:+13055551234"
            note="Mon–Sat · 8a–7p"
          />
        </div>

        {/* Hours strip */}
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[hsl(var(--hairline))] bg-white p-4 text-sm shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Clock className="h-4 w-4" />
          </span>
          <p className="text-ink-soft">
            <span className="font-semibold text-ink">We're open now.</span>{" "}
            Support hours: Monday – Saturday, 8 AM – 7 PM ET.
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-10">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <HelpCircle className="h-4 w-4 text-[hsl(var(--primary))]" />
            Common questions
          </h2>
          <div className="mt-4 divide-y divide-[hsl(var(--hairline))] overflow-hidden rounded-2xl border border-[hsl(var(--hairline))] bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
            {FAQ.map((item, i) => {
              const open = openIdx === i;
              return (
                <button
                  key={item.q}
                  type="button"
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="block w-full px-5 py-4 text-left transition hover:bg-cream/50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-ink">{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                  {open && (
                    <p className="mt-3 text-sm leading-relaxed text-ink-soft animate-calm-in">
                      {item.a}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-10">
          <h2 className="text-base font-bold text-ink">Quick actions</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {QUICK.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.label}
                  to={q.to}
                  className="flex items-center justify-between rounded-2xl border border-[hsl(var(--hairline))] bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition hover:bg-cream"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-ink">{q.label}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-ink-faint" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactCard({
  icon,
  label,
  value,
  href,
  note,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
  note: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      className={`group block rounded-2xl border p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 ${
        primary
          ? "border-transparent bg-[hsl(var(--primary))] text-white"
          : "border-[hsl(var(--hairline))] bg-white text-ink"
      }`}
    >
      <div
        className={`grid h-10 w-10 place-items-center rounded-full ${
          primary ? "bg-white/15 text-white" : "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
        }`}
      >
        {icon}
      </div>
      <p
        className={`mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] ${
          primary ? "text-white/70" : "text-ink-faint"
        }`}
      >
        {label}
      </p>
      <p className="mt-2 text-lg font-bold tracking-tight">{value}</p>
      <p
        className={`mt-1 text-xs ${
          primary ? "text-white/80" : "text-ink-soft"
        }`}
      >
        {note}
      </p>
    </a>
  );
}
