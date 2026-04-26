/**
 * /account — Calm account control center.
 *
 * Live profile + access + preferences read from Supabase profiles table.
 * Read-mostly today; "edit" actions open the same calm modals used on
 * the dashboard so customers never feel like they're managing software.
 */
import { Navigate, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  ArrowRight,
  User,
  Home,
  Phone,
  Mail,
  KeyRound,
  Bell,
  LogOut,
  Edit3,
  ShieldCheck,
} from "lucide-react";
import { CUSTOMER_ACCOUNT_ENABLED } from "@/lib/dashboard-config";
import DashboardTopNav from "@/components/dashboard/DashboardTopNav";
import CalmModal from "@/components/dashboard/CalmModal";
import { useDashboardData } from "@/lib/dashboard-data";
import { supabase } from "@/integrations/supabase/client";

export default function Account() {
  const navigate = useNavigate();
  const data = useDashboardData();
  const [editing, setEditing] = useState<null | "profile" | "address" | "access" | "notifications">(null);

  if (!CUSTOMER_ACCOUNT_ENABLED) return <Navigate to="/" replace />;

  if (data.loading) {
    return (
      <div className="min-h-screen bg-cream">
        <DashboardTopNav />
        <div className="mx-auto max-w-[1100px] px-6 py-12">
          <div className="h-8 w-48 animate-pulse rounded bg-white/70" />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/70" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data.isAuthed) {
    navigate("/login", { replace: true });
    return null;
  }

  const p = data.profile;
  const fullName = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—";
  const address = p?.address_line1
    ? `${p.address_line1}${p.address_line2 ? `, ${p.address_line2}` : ""}, ${p.city ?? ""} ${p.zip ?? ""}`.trim()
    : "—";

  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashboardTopNav initials={data.initials} />

      <section className="mx-auto max-w-[1100px] px-6 pt-10 pb-16">
        <div className="animate-calm-in">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
            account
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
            <span className="text-ink">your details,</span>{" "}
            <span className="text-[hsl(var(--primary))]">handled.</span>
          </h1>
          <p className="mt-3 text-base text-ink-soft">
            Everything we need to take care of your home, in one place.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <AccountCard
            icon={<User className="h-4 w-4 text-[hsl(var(--primary))]" />}
            label="Profile"
            onEdit={() => setEditing("profile")}
          >
            <Row k="Name" v={fullName} />
            <Row k="Phone" v={p?.phone || "—"} icon={<Phone className="h-3.5 w-3.5" />} />
            <Row k="Email" v={data.email || "—"} icon={<Mail className="h-3.5 w-3.5" />} />
          </AccountCard>

          <AccountCard
            icon={<Home className="h-4 w-4 text-[hsl(var(--primary))]" />}
            label="Service Address"
            onEdit={() => setEditing("address")}
          >
            <Row k="Address" v={address} />
            <Row k="City" v={p?.city || "—"} />
            <Row k="ZIP" v={p?.zip || "—"} />
          </AccountCard>

          <AccountCard
            icon={<KeyRound className="h-4 w-4 text-[hsl(var(--primary))]" />}
            label="Access & Pets"
            onEdit={() => setEditing("access")}
          >
            <Row k="Gate code" v={p?.gate_code || "Not set"} />
            <Row k="Parking" v={p?.parking_notes || "Not set"} />
            <Row k="Pets" v={p?.pets || "None"} />
          </AccountCard>

          <AccountCard
            icon={<Bell className="h-4 w-4 text-[hsl(var(--primary))]" />}
            label="Preferences"
            onEdit={() => setEditing("notifications")}
          >
            <Row k="Preferred day" v={p?.preferred_day || "Any"} />
            <Row k="Preferred time" v={p?.preferred_time || "Any"} />
            <Row k="Notes for crew" v={p?.special_instructions || "None"} />
          </AccountCard>
        </div>

        {/* Security + sign out */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="flex items-start gap-4 rounded-2xl border border-[hsl(var(--hairline))] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Account secured</p>
              <p className="mt-1 text-xs text-ink-soft">
                Password set. Forgot it?
              </p>
              <Link
                to="/forgot-password"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
              >
                Reset password <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            className="flex items-center justify-between rounded-2xl border border-[hsl(var(--hairline))] bg-white p-6 text-left shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition hover:bg-cream"
          >
            <div className="flex items-center gap-4">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-cream text-ink-soft">
                <LogOut className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Sign out</p>
                <p className="text-xs text-ink-soft">We'll keep things ready for next time.</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-faint" />
          </button>
        </div>
      </section>

      <CalmModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing === "profile"
            ? "Update your profile"
            : editing === "address"
            ? "Update service address"
            : editing === "access"
            ? "Update access & pets"
            : "Update preferences"
        }
        description="Send us a quick note and we'll update your file within the hour."
      >
        <p className="text-sm text-ink-soft">
          For now, please text us at{" "}
          <a href="sms:+13055551234" className="font-semibold text-[hsl(var(--primary))]">
            (305) 555-1234
          </a>{" "}
          or email{" "}
          <a href="mailto:hello@jointidy.co" className="font-semibold text-[hsl(var(--primary))]">
            hello@jointidy.co
          </a>{" "}
          and we'll handle the change for you.
        </p>
        <p className="mt-3 text-xs text-ink-faint">
          In-app editing is launching soon.
        </p>
      </CalmModal>
    </div>
  );
}

function AccountCard({
  icon,
  label,
  children,
  onEdit,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--hairline))] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[hsl(var(--primary))]/10">
            {icon}
          </span>
          <h2 className="text-sm font-bold text-ink">{label}</h2>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[hsl(var(--primary))] transition hover:bg-cream"
          >
            <Edit3 className="h-3 w-3" /> Edit
          </button>
        )}
      </div>
      <dl className="mt-4 space-y-3">{children}</dl>
    </div>
  );
}

function Row({ k, v, icon }: { k: string; v: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--hairline))]/60 pb-2 last:border-0 last:pb-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
        {icon}
        {k}
      </dt>
      <dd className="text-right text-sm font-medium text-ink">{v}</dd>
    </div>
  );
}
