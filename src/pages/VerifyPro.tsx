/**
 * /verify/:token — public Pro badge verification.
 *
 * A stranger is at the customer's front door. No login, ever. The page answers
 * one question — is this a real, current Tidy Pro — above the fold, and gets
 * out of the way. Status resolves LIVE from the Pro record on every load
 * (no caching), so deactivating a badge takes effect immediately.
 *
 * It confirms a CREDENTIAL, never an appointment.
 *
 * Craft: navy room, one elevated card. Verification is stated quietly (a small
 * pill, not a full-bleed green band). Tokens live in index.css under
 * `.verify-page` and are re-checked for dark mode.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, Phone, ShieldCheck, IdCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

/** Understated status pill — replaces the shouted success band entirely. */
const StatusPill = ({ tone, label }: { tone: "green" | "amberred" | "neutral"; label: string }) => {
  const dot =
    tone === "green"
      ? "hsl(var(--v-green))"
      : tone === "amberred"
        ? "hsl(var(--v-amberred))"
        : "hsl(var(--v-neutral))";
  return (
    <div
      className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{ backgroundColor: "hsl(var(--v-card-fg) / 0.05)" }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
      <span
        className="text-[11px] font-semibold uppercase"
        style={{ letterSpacing: "0.14em", color: "hsl(var(--v-card-fg) / 0.75)" }}
      >
        {label}
      </span>
    </div>
  );
};

/** A record row, not a checklist item — statement-of-account rhythm. */
const VerifiedRow = ({
  title,
  detail,
  index,
}: {
  title: string;
  detail: string;
  index: number;
}) => (
  <div
    className="verify-row flex items-start gap-3 py-4"
    style={{
      animationDelay: `${400 + index * 60}ms`,
      borderTop: index === 0 ? "none" : "1px solid hsl(var(--v-hairline))",
    }}
  >
    <span
      className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: "hsl(var(--v-green))" }}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3.5} style={{ color: "hsl(var(--v-card))" }} />
    </span>
    <div className="min-w-0">
      <p className="text-sm font-semibold" style={{ color: "hsl(var(--v-card-fg))" }}>
        {title}
      </p>
      <p
        className="tabular mt-0.5 text-[12.5px] leading-snug"
        style={{ color: "hsl(var(--v-muted-fg))" }}
      >
        {detail}
      </p>
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
  const showPhoto = state === "active" || state === "inactive";

  return (
    <div
      className="verify-page flex min-h-screen flex-col px-4 py-7 sm:py-12"
      style={{
        background:
          "linear-gradient(180deg, hsl(var(--v-ground)) 0%, hsl(var(--v-ground-2)) 100%)",
      }}
    >
      <Helmet>
        <title>Verify a Tidy Pro badge</title>
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
        <meta name="googlebot" content="noindex, nofollow" />
      </Helmet>

      <main className="mx-auto w-full max-w-[26rem] flex-1">
        <section
          className="verify-card rounded-[22px] px-6 py-8 sm:px-8"
          style={{
            backgroundColor: "hsl(var(--v-card))",
            boxShadow: "var(--v-shadow)",
          }}
        >
          {/* Roundel */}
          <div className="flex justify-center">
            <TidyLogo size="sm" className="h-10 w-10" />
          </div>

          {state === "loading" && (
            <p
              className="mt-8 text-center text-sm"
              style={{ color: "hsl(var(--v-muted-fg))" }}
            >
              Checking this badge…
            </p>
          )}

          {/* ---- Identity block ---- */}
          {showPhoto && pro && (
            <div className="mt-7 text-center">
              {pro.badge_photo_url ? (
                <img
                  src={pro.badge_photo_url}
                  alt={`${pro.display_name ?? "Tidy Pro"} badge photo`}
                  className={`mx-auto h-[140px] w-[140px] object-cover ${state === "inactive" ? "grayscale" : ""}`}
                  style={{
                    borderRadius: "20px",
                    boxShadow: "0 12px 28px -14px hsl(222 47% 8% / 0.45)",
                    border: "3px solid hsl(var(--v-ring))",
                    opacity: state === "inactive" ? 0.6 : 1,
                  }}
                />
              ) : (
                <div
                  className="mx-auto flex h-[140px] w-[140px] items-center justify-center"
                  style={{
                    borderRadius: "20px",
                    border: "3px solid hsl(var(--v-ring))",
                    backgroundColor: "hsl(var(--v-card-fg) / 0.06)",
                  }}
                >
                  <IdCard className="h-10 w-10" style={{ color: "hsl(var(--v-muted-fg))" }} />
                </div>
              )}

              <StatusPill
                tone={state === "active" ? "green" : "amberred"}
                label={state === "active" ? "Verified" : "Not active"}
              />

              <h1
                className="font-archivo mt-4 text-[34px] font-extrabold leading-[1.05]"
                style={{
                  letterSpacing: "-0.02em",
                  color: state === "inactive" ? "hsl(var(--v-muted-fg))" : "hsl(var(--v-card-fg))",
                }}
              >
                {pro.display_name ?? "Tidy Pro"}
              </h1>

              <p
                className="tabular mt-2 font-mono text-xs"
                style={{ letterSpacing: "0.12em", color: "hsl(var(--v-muted-fg))" }}
              >
                {pro.pro_number ?? "—"}
                {state === "inactive" ? " · deactivated" : ""}
              </p>

              {state === "active" && services && (
                <p className="mt-2 text-sm" style={{ color: "hsl(var(--v-muted-fg))" }}>
                  {services}
                </p>
              )}
            </div>
          )}

          {state === "notfound" && (
            <div className="mt-7 text-center">
              <StatusPill tone="neutral" label="Unrecognised" />
              <h1
                className="font-archivo mt-4 text-[28px] font-extrabold leading-[1.1]"
                style={{ letterSpacing: "-0.02em", color: "hsl(var(--v-card-fg))" }}
              >
                We don't recognise this badge
              </h1>
              <p className="mt-2 text-sm" style={{ color: "hsl(var(--v-muted-fg))" }}>
                No Tidy Pro matches this code.
              </p>
            </div>
          )}

          {/* The single gold moment */}
          {state !== "loading" && (
            <div
              className="mx-auto mt-7 h-[2px] w-10 rounded-full"
              style={{ backgroundColor: "hsl(var(--gold))" }}
            />
          )}

          {/* ---- Active: the record ---- */}
          {state === "active" && (
            <>
              <div className="mt-2">
                <VerifiedRow
                  index={0}
                  title="Background checked"
                  detail={cleared ? `Cleared through Checkr, ${cleared}` : "Cleared through Checkr"}
                />
                {pro?.insurance_active && (
                  <VerifiedRow index={1} title="Liability insurance active" detail="$1M policy, verified by Tidy" />
                )}
                <VerifiedRow index={2} title="With Tidy since" detail={since ?? "—"} />
              </div>

              <a
                href={PHONE_TEL}
                className="mt-6 flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold"
                style={{
                  border: "1px solid hsl(var(--v-hairline))",
                  color: "hsl(var(--primary))",
                }}
              >
                Not expecting a visit?
              </a>
            </>
          )}

          {/* ---- Not active: calm, factual, authoritative ---- */}
          {state === "inactive" && (
            <>
              <div className="mt-5 space-y-3">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--v-card-fg))" }}>
                  This badge is no longer valid. This person does not currently work with Tidy.
                </p>
                <p
                  className="text-sm font-semibold leading-relaxed"
                  style={{ color: "hsl(var(--v-amberred))" }}
                >
                  Do not allow access to your home on the strength of this badge.
                </p>
              </div>
              <a
                href={PHONE_TEL}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "hsl(var(--v-amberred))", color: "hsl(var(--v-card))" }}
              >
                <Phone className="h-4 w-4" /> Call Tidy now · {PHONE_DISPLAY}
              </a>
            </>
          )}

          {/* ---- Not found ---- */}
          {state === "notfound" && (
            <>
              <p className="mt-5 text-sm leading-relaxed" style={{ color: "hsl(var(--v-card-fg))" }}>
                This badge was not issued by Tidy, or the code was mistyped.
              </p>
              <div className="mt-5 flex items-start gap-3 py-4" style={{ borderTop: "1px solid hsl(var(--v-hairline))" }}>
                <ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ color: "hsl(var(--primary))" }} />
                <p className="text-sm leading-snug" style={{ color: "hsl(var(--v-muted-fg))" }}>
                  Every Tidy Pro carries a photo badge — with their name, a Pro number, and a code
                  that resolves to this page.
                </p>
              </div>
              <a
                href={PHONE_TEL}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "hsl(var(--v-amberred))", color: "hsl(var(--v-card))" }}
              >
                <Phone className="h-4 w-4" /> Call Tidy now · {PHONE_DISPLAY}
              </a>
            </>
          )}

          <div
            className="mt-7 pt-5 text-center"
            style={{ borderTop: "1px solid hsl(var(--v-hairline))" }}
          >
            <p className="text-sm" style={{ color: "hsl(var(--v-muted-fg))" }}>
              Tidy Home Concierge LLC
            </p>
            <a
              href={PHONE_TEL}
              className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold"
              style={{ color: "hsl(var(--primary))" }}
            >
              {PHONE_DISPLAY}
            </a>
            {(state === "inactive" || state === "notfound") && (
              <p className="text-sm font-semibold" style={{ color: "hsl(var(--v-amberred))" }}>
                If you feel unsafe, call 911 first.
              </p>
            )}
          </div>
        </section>

        {/* Below the fold — quiet, no pitch */}
        <p className="mt-8 px-2 text-center text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
          Tidy — home care on a schedule in Pinecrest, Kendall and Kendall West.{" "}
          <a
            href="https://jointidy.co"
            className="underline underline-offset-2"
            style={{ color: "hsl(0 0% 100% / 0.85)" }}
          >
            jointidy.co
          </a>
        </p>
      </main>
    </div>
  );
};

export default VerifyPro;
