/**
 * /verify/:token — public Pro badge verification.
 *
 * A stranger is at the customer's front door. No login, ever. The page answers
 * one question — is this a real, current Tidy Pro — above the fold, and gets
 * out of the way. Status resolves LIVE from the Pro record on every load
 * (no caching), so deactivating a badge takes effect immediately.
 *
 * It confirms a CREDENTIAL, never an appointment.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { BadgeCheck, AlertTriangle, HelpCircle, Check, Phone, ShieldCheck, IdCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import TidyLogo from "@/components/TidyLogo";

const PHONE_DISPLAY = "(786) 829-1141";
const PHONE_TEL = "tel:+17868291141";

type BadgeRow = {
  display_name: string | null;
  pro_number: string | null;
  badge_status: string | null;
  badge_photo_url: string | null;
  services: string | null;
  bg_check_cleared_at: string | null;
  insurance_active: boolean | null;
  pro_since: string | null;
};

type State = "loading" | "active" | "inactive" | "notfound";

const monthYear = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const longDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const serviceLabel = (raw: string | null) => {
  if (!raw) return null;
  const map: Record<string, string> = {
    house_clean: "House Cleaning",
    house_cleaning: "House Cleaning",
    cleaning: "House Cleaning",
    car_detail: "Car Detail",
    car_wash: "Car Wash",
    detailing: "Car Detail",
    lawn: "Lawn Care",
    lawn_care: "Lawn Care",
    both: "House Cleaning, Car Detail",
  };
  return raw
    .split(/[,+]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => map[s.toLowerCase()] ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(", ");
};

const VerifiedRow = ({ title, detail }: { title: string; detail: string }) => (
  <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-emerald-500 flex items-center justify-center">
      <Check className="h-3 w-3 text-white" strokeWidth={3} />
    </span>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  </div>
);

const VerifyPro = () => {
  const { token } = useParams();
  const [state, setState] = useState<State>("loading");
  const [pro, setPro] = useState<BadgeRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      const { data, error } = await supabase.rpc("verify_pro_badge", { _token: token ?? "" });
      if (cancelled) return;
      const row = (Array.isArray(data) ? data[0] : null) as BadgeRow | null;
      if (error || !row) {
        setPro(null);
        setState("notfound");
        return;
      }
      setPro(row);
      setState(row.badge_status === "active" ? "active" : "inactive");
    })();
    return () => { cancelled = true; };
  }, [token]);

  const since = monthYear(pro?.pro_since ?? null);
  const cleared = longDate(pro?.bg_check_cleared_at ?? null);
  const services = serviceLabel(pro?.services ?? null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>Verify a Tidy Pro badge</title>
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
        <meta name="googlebot" content="noindex, nofollow" />
      </Helmet>

      {/* ---- Status band: always the first thing on screen ---- */}
      {state === "loading" && (
        <div className="w-full bg-muted px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">Checking this badge…</p>
        </div>
      )}

      {state === "active" && (
        <div className="w-full bg-emerald-600 px-5 py-7 text-center text-white">
          <BadgeCheck className="mx-auto h-10 w-10" strokeWidth={2.2} />
          <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">Verified Tidy Pro</h1>
          <p className="mt-1 text-sm text-emerald-50">This badge is active today.</p>
        </div>
      )}

      {state === "inactive" && (
        <div className="w-full bg-red-600 px-5 py-7 text-center text-white">
          <AlertTriangle className="mx-auto h-10 w-10" strokeWidth={2.2} />
          <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">This badge is no longer valid</h1>
          <p className="mt-1 text-sm text-red-50">This person does not currently work with Tidy.</p>
        </div>
      )}

      {state === "notfound" && (
        <div className="w-full bg-slate-500 px-5 py-7 text-center text-white">
          <HelpCircle className="mx-auto h-10 w-10" strokeWidth={2.2} />
          <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">We don't recognise this badge</h1>
          <p className="mt-1 text-sm text-slate-100">No Tidy Pro matches this code.</p>
        </div>
      )}

      <main className="flex-1 w-full max-w-md mx-auto px-5 py-6">
        {(state === "active" || state === "inactive") && pro && (
          <div className="text-center">
            {pro.badge_photo_url ? (
              <img
                src={pro.badge_photo_url}
                alt={`${pro.display_name ?? "Tidy Pro"} badge photo`}
                className={`mx-auto h-[118px] w-[118px] rounded-2xl object-cover ${state === "inactive" ? "grayscale opacity-50" : ""}`}
              />
            ) : (
              <div className={`mx-auto h-[118px] w-[118px] rounded-2xl bg-muted flex items-center justify-center ${state === "inactive" ? "opacity-50" : ""}`}>
                <IdCard className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
            <p className={`mt-3 text-2xl font-bold ${state === "inactive" ? "text-muted-foreground" : "text-foreground"}`}>
              {pro.display_name ?? "Tidy Pro"}
            </p>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {pro.pro_number ?? "—"}{state === "inactive" ? " · deactivated" : ""}
            </p>
            {state === "active" && services && (
              <p className="mt-1 text-xs text-muted-foreground">{services}</p>
            )}
          </div>
        )}

        {state === "active" && (
          <>
            <div className="mt-6 rounded-xl border border-border bg-card px-4 py-1">
              <VerifiedRow
                title="Background checked"
                detail={cleared ? `Cleared through Checkr, ${cleared}` : "Cleared through Checkr"}
              />
              {pro?.insurance_active && (
                <VerifiedRow title="Liability insurance active" detail="$1M policy, verified by Tidy" />
              )}
              <VerifiedRow title="With Tidy since" detail={since ?? "—"} />
            </div>
            <Button asChild variant="outline" className="mt-6 w-full h-12">
              <a href={PHONE_TEL}>Not expecting a visit?</a>
            </Button>
          </>
        )}

        {state === "inactive" && (
          <>
            <p className="mt-6 text-sm font-semibold text-red-600 text-center">
              Do not allow access to your home on the strength of this badge.
            </p>
            <Button asChild className="mt-5 w-full h-12 bg-red-600 hover:bg-red-700 text-white">
              <a href={PHONE_TEL}>
                <Phone className="mr-2 h-4 w-4" /> Call Tidy now · {PHONE_DISPLAY}
              </a>
            </Button>
          </>
        )}

        {state === "notfound" && (
          <>
            <p className="mt-2 text-sm text-muted-foreground text-center">
              This badge was not issued by Tidy, or the code was mistyped.
            </p>
            <div className="mt-6 rounded-xl border border-border bg-card p-4 flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Every Tidy Pro carries a photo badge — with their name, a Pro number, and a code that
                resolves to this page.
              </p>
            </div>
            <Button asChild className="mt-6 w-full h-12 bg-red-600 hover:bg-red-700 text-white">
              <a href={PHONE_TEL}>
                <Phone className="mr-2 h-4 w-4" /> Call Tidy now · {PHONE_DISPLAY}
              </a>
            </Button>
          </>
        )}
      </main>

      <footer className="w-full max-w-md mx-auto px-5 pb-8 text-center">
        <div className="flex justify-center opacity-80"><TidyLogo size="sm" /></div>
        <p className="mt-3 text-xs text-muted-foreground">Tidy Home Concierge LLC</p>
        <a href={PHONE_TEL} className="text-xs text-muted-foreground underline">{PHONE_DISPLAY}</a>
        {(state === "inactive" || state === "notfound") && (
          <p className="mt-2 text-xs font-semibold text-red-600">If you feel unsafe, call 911 first.</p>
        )}
      </footer>
    </div>
  );
};

export default VerifyPro;
