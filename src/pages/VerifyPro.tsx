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
 * Craft: a private-bank credential document. Navy room, one elevated card with
 * a brand-edge accent, a gold-haloed portrait plate, ruled record tiles with
 * label/value rhythm, and a quiet institutional footer band. Tokens live in
 * index.css under `.verify-page` and are re-checked for dark mode.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, Phone, ShieldCheck, IdCard, CalendarDays } from "lucide-react";
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

/** Understated status pill, seated on the portrait plate. */
const StatusPill = ({ tone, label }: { tone: "green" | "amberred" | "neutral"; label: string }) => {
  const color =
    tone === "green"
      ? "hsl(var(--v-green))"
      : tone === "amberred"
        ? "hsl(var(--v-amberred))"
        : "hsl(var(--v-neutral))";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
      style={{
        backgroundColor: color,
        color: "hsl(var(--v-card))",
        boxShadow: `0 0 0 4px hsl(var(--v-card)), 0 6px 16px -8px ${color}`,
      }}
    >
      <span
        className="text-[10px] font-bold uppercase leading-none"
        style={{ letterSpacing: "0.16em" }}
      >
        {label}
      </span>
    </span>
  );
};

/** A record tile — eyebrow label above the value, statement-of-account rhythm. */
const RecordTile = ({
  icon,
  label,
  value,
  index,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  index: number;
}) => (
  <div
    className="verify-row flex items-center gap-4 rounded-2xl px-4 py-3.5"
    style={{
      animationDelay: `${360 + index * 70}ms`,
      backgroundColor: "hsl(var(--v-tile))",
      border: "1px solid hsl(var(--v-tile-border))",
    }}
  >
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: "hsl(var(--v-green) / 0.12)", color: "hsl(var(--v-green))" }}
    >
      {icon}
    </span>
    <div className="min-w-0">
      <p
        className="text-[10px] font-bold uppercase"
        style={{ letterSpacing: "0.14em", color: "hsl(var(--v-tile-fg))" }}
      >
        {label}
      </p>
      <p
        className="tabular mt-0.5 text-[13.5px] font-semibold leading-snug"
        style={{ color: "hsl(var(--v-card-fg))" }}
      >
        {value}
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

      <main className="mx-auto w-full max-w-[26.25rem] flex-1">
        <section
          className="verify-card relative overflow-hidden rounded-[30px]"
          style={{
            backgroundColor: "hsl(var(--v-card))",
            boxShadow: "var(--v-shadow)",
            border: "1px solid hsl(var(--v-hairline))",
          }}
        >
          {/* Brand edge — the issuing mark of the document */}
          <div
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              background:
                "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--gold)) 50%, hsl(var(--primary)) 100%)",
            }}
          />

          <div className="px-6 pb-7 pt-9 sm:px-8">
            {/* Roundel */}
            <div className="flex h-10 items-center justify-center [&_img]:!h-10 [&_img]:!w-auto">
              <TidyLogo size="sm" />
            </div>

            <p
              className="mt-3 text-center text-[10px] font-bold uppercase"
              style={{ letterSpacing: "0.24em", color: "hsl(var(--v-tile-fg))" }}
            >
              Pro Credential
            </p>

            {state === "loading" && (
              <p className="mt-8 text-center text-sm" style={{ color: "hsl(var(--v-muted-fg))" }}>
                Checking this badge…
              </p>
            )}

            {/* ---- Identity plate ---- */}
            {showPhoto && pro && (
              <div className="mt-7 text-center">
                <div className="relative mx-auto h-[140px] w-[140px]">
                  {state === "active" && (
                    <div
                      className="absolute -inset-1 rounded-full"
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(var(--gold)) 0%, hsl(var(--gold) / 0.35) 60%, hsl(var(--primary) / 0.35) 100%)",
                        filter: "blur(2px)",
                        opacity: 0.65,
                      }}
                    />
                  )}
                  {pro.badge_photo_url ? (
                    <img
                      src={pro.badge_photo_url}
                      alt={`${pro.display_name ?? "Tidy Pro"} badge photo`}
                      className={`relative h-[140px] w-[140px] rounded-full object-cover ${state === "inactive" ? "grayscale" : ""}`}
                      style={{
                        border: "3px solid hsl(var(--v-ring))",
                        boxShadow: "0 14px 30px -14px hsl(222 47% 8% / 0.5)",
                        opacity: state === "inactive" ? 0.6 : 1,
                      }}
                    />
                  ) : (
                    <div
                      className="relative flex h-[140px] w-[140px] items-center justify-center rounded-full"
                      style={{
                        border: "3px solid hsl(var(--v-ring))",
                        backgroundColor: "hsl(var(--v-tile))",
                        boxShadow: "0 14px 30px -14px hsl(222 47% 8% / 0.5)",
                      }}
                    >
                      <IdCard className="h-10 w-10" style={{ color: "hsl(var(--v-tile-fg))" }} />
                    </div>
                  )}

                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                    <StatusPill
                      tone={state === "active" ? "green" : "amberred"}
                      label={state === "active" ? "Verified" : "Not active"}
                    />
                  </div>
                </div>

                <h1
                  className="font-archivo mt-7 text-[32px] font-extrabold leading-[1.05]"
                  style={{
                    letterSpacing: "-0.02em",
                    color: state === "inactive" ? "hsl(var(--v-muted-fg))" : "hsl(var(--v-card-fg))",
                  }}
                >
                  {pro.display_name ?? "Tidy Pro"}
                </h1>

                <div className="mt-2.5 flex items-center justify-center gap-2">
                  <span
                    className="text-[10px] font-bold uppercase"
                    style={{ letterSpacing: "0.18em", color: "hsl(var(--v-tile-fg))" }}
                  >
                    Pro ID
                  </span>
                  <code
                    className="tabular rounded-md px-2 py-0.5 font-mono text-[12px] font-semibold"
                    style={{
                      letterSpacing: "0.08em",
                      backgroundColor: "hsl(var(--v-tile))",
                      border: "1px solid hsl(var(--v-tile-border))",
                      color: state === "inactive" ? "hsl(var(--v-amberred))" : "hsl(var(--primary))",
                    }}
                  >
                    {pro.pro_number ?? "—"}
                  </code>
                </div>

                {state === "inactive" && (
                  <p
                    className="mt-2 text-[11px] font-bold uppercase"
                    style={{ letterSpacing: "0.16em", color: "hsl(var(--v-amberred))" }}
                  >
                    Deactivated
                  </p>
                )}

                {state === "active" && services && (
                  <p
                    className="mt-3.5 inline-block rounded-lg px-3 py-1 text-[12px] font-semibold uppercase"
                    style={{
                      letterSpacing: "0.08em",
                      backgroundColor: "hsl(var(--v-tile))",
                      border: "1px solid hsl(var(--v-tile-border))",
                      color: "hsl(var(--v-muted-fg))",
                    }}
                  >
                    {services}
                  </p>
                )}
              </div>
            )}

            {state === "notfound" && (
              <div className="mt-8 text-center">
                <StatusPill tone="neutral" label="Unrecognised" />
                <h1
                  className="font-archivo mt-5 text-[27px] font-extrabold leading-[1.1]"
                  style={{ letterSpacing: "-0.02em", color: "hsl(var(--v-card-fg))" }}
                >
                  We don't recognise this badge
                </h1>
                <p className="mt-2 text-sm" style={{ color: "hsl(var(--v-muted-fg))" }}>
                  No Tidy Pro matches this code.
                </p>
              </div>
            )}

            {/* Ruled divider with the single gold moment */}
            {state !== "loading" && (
              <div className="mt-7 flex items-center justify-center">
                <span
                  className="h-px flex-1"
                  style={{
                    background: "linear-gradient(90deg, transparent, hsl(var(--v-hairline)))",
                  }}
                />
                <span
                  className="mx-4 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "hsl(var(--gold))" }}
                />
                <span
                  className="h-px flex-1"
                  style={{
                    background: "linear-gradient(270deg, transparent, hsl(var(--v-hairline)))",
                  }}
                />
              </div>
            )}

            {/* ---- Active: the record ---- */}
            {state === "active" && (
              <>
                <div className="mt-6 space-y-3">
                  <RecordTile
                    index={0}
                    icon={<Check className="h-4.5 w-4.5" strokeWidth={3} />}
                    label="Clearance"
                    value={cleared ? `Background checked · Checkr, ${cleared}` : "Background checked · Checkr"}
                  />
                  {pro?.insurance_active && (
                    <RecordTile
                      index={1}
                      icon={<ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2.4} />}
                      label="Liability"
                      value="$1M policy active, verified by Tidy"
                    />
                  )}
                  <RecordTile
                    index={2}
                    icon={<CalendarDays className="h-[18px] w-[18px]" strokeWidth={2.2} />}
                    label="Tenure"
                    value={since ? `With Tidy since ${since}` : "With Tidy"}
                  />
                </div>

                <a
                  href={PHONE_TEL}
                  className="mt-7 flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold"
                  style={{
                    border: "1px solid hsl(var(--v-hairline))",
                    color: "hsl(var(--primary))",
                    backgroundColor: "hsl(var(--v-card))",
                  }}
                >
                  Not expecting a visit?
                </a>
              </>
            )}

            {/* ---- Not active: calm, factual, authoritative ---- */}
            {state === "inactive" && (
              <>
                <div className="mt-6 space-y-3">
                  <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--v-card-fg))" }}>
                    This badge is no longer valid. This person does not currently work with Tidy.
                  </p>
                  <p
                    className="rounded-2xl px-4 py-3 text-sm font-semibold leading-relaxed"
                    style={{
                      backgroundColor: "hsl(var(--v-amberred) / 0.1)",
                      border: "1px solid hsl(var(--v-amberred) / 0.28)",
                      color: "hsl(var(--v-amberred))",
                    }}
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
                <p className="mt-6 text-sm leading-relaxed" style={{ color: "hsl(var(--v-card-fg))" }}>
                  This badge was not issued by Tidy, or the code was mistyped.
                </p>
                <div
                  className="mt-4 flex items-start gap-4 rounded-2xl px-4 py-3.5"
                  style={{
                    backgroundColor: "hsl(var(--v-tile))",
                    border: "1px solid hsl(var(--v-tile-border))",
                  }}
                >
                  <ShieldCheck
                    className="mt-0.5 h-[18px] w-[18px] shrink-0"
                    style={{ color: "hsl(var(--primary))" }}
                  />
                  <p className="text-[13px] leading-snug" style={{ color: "hsl(var(--v-muted-fg))" }}>
                    Every Tidy Pro carries a photo badge — with their name, a Pro number, and a code
                    that resolves to this page.
                  </p>
                </div>
                <a
                  href={PHONE_TEL}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: "hsl(var(--v-amberred))", color: "hsl(var(--v-card))" }}
                >
                  <Phone className="h-4 w-4" /> Call Tidy now · {PHONE_DISPLAY}
                </a>
              </>
            )}
          </div>

          {/* Institutional footer band */}
          <div
            className="px-6 py-5 text-center sm:px-8"
            style={{
              backgroundColor: "hsl(var(--v-tile))",
              borderTop: "1px solid hsl(var(--v-tile-border))",
            }}
          >
            <p
              className="text-[10px] font-bold uppercase"
              style={{ letterSpacing: "0.2em", color: "hsl(var(--v-tile-fg))" }}
            >
              Tidy Home Concierge LLC
            </p>
            <a
              href={PHONE_TEL}
              className="tabular mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold"
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
        <p className="mt-8 px-2 text-center text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
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
