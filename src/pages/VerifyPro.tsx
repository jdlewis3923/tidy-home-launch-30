/**
 * /verify/:token — public Pro badge verification.
 *
 * A stranger is at the customer's front door. No login, ever. The page answers
 * one question — is this a real, current Tidy Pro — above the fold on a
 * 360x640 phone, then offers depth below it. Status resolves LIVE from the Pro
 * record on every load (no caching), so deactivating a badge takes effect
 * immediately.
 *
 * It confirms a CREDENTIAL, never an appointment.
 *
 * Craft: navy room built from our own roundel — a slow sunburst, a soft glow,
 * fine grain, drifting gold sparks — with one frosted-glass credential card on
 * it. Tokens live in index.css under `.verify-page`; every animation is opted
 * out under prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, Phone, ShieldCheck, IdCard, CalendarDays, Camera, UserRound, Sparkle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TidyLogo from "@/components/TidyLogo";
import Reveal from "@/components/motion/Reveal";

const PHONE_DISPLAY = "(786) 829-1141";
const PHONE_TEL = "tel:+17868291141";
const EMAIL = "hello@jointidy.co";

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

type State = "loading" | "active" | "suspended" | "revoked" | "notissued";

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

/* ------------------------------------------------------------------ ground */

const Ground = () => {
  const burst = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (burst.current) burst.current.style.translate = `0 ${window.scrollY * 0.3}px`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* sunburst from the roundel, parallaxed at 30% of scroll */}
      <div ref={burst} className="absolute left-1/2 top-[18vh] h-[150vmax] w-[150vmax] -translate-x-1/2">
        <div className="verify-sunburst absolute inset-0 rounded-full" />
      </div>
      {/* centre lift, edges fall away */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 26%, hsl(var(--primary) / 0.22) 0%, transparent 70%), radial-gradient(120% 90% at 50% 50%, transparent 35%, hsl(207 75% 9% / 0.7) 100%)",
        }}
      />
      <div className="verify-grain absolute inset-0" />
      {[
        { top: "7%", left: "8%", size: 16, delay: "0s" },
        { top: "12%", right: "10%", size: 12, delay: "1.6s" },
        { bottom: "22%", left: "12%", size: 13, delay: "3.1s" },
        { bottom: "10%", right: "9%", size: 10, delay: "4.4s" },
      ].map((s, i) => (
        <Sparkle
          key={i}
          className="verify-sparkle absolute"
          strokeWidth={1.4}
          style={{
            ...s,
            width: s.size,
            height: s.size,
            color: "hsl(var(--gold))",
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------- orb */

const StatusOrb = ({ tone, label }: { tone: "green" | "amberred" | "neutral"; label: string }) => {
  // Verified flashes green; anything unauthorised (inactive or unrecognised) flashes red.
  const color = tone === "green" ? "hsl(var(--v-green))" : "hsl(var(--v-amberred))";
  return (
    <span
      className="inline-flex items-center gap-2.5 rounded-full py-1.5 pl-3 pr-4"
      style={{
        backgroundColor: "hsl(var(--v-tile))",
        border: `1px solid ${color}`,
      }}
    >
      <span className="relative flex h-3.5 w-3.5 items-center justify-center">
        <span
          className="verify-orb-ring absolute inset-0 rounded-full"
          style={{ border: `1.5px solid ${color}` }}
        />
        <span
          className="verify-orb-ring absolute inset-0 rounded-full"
          style={{ border: `1.5px solid ${color}`, animationDelay: "1.2s" }}
        />
        <span className="verify-flash h-3.5 w-3.5 rounded-full" style={{ backgroundColor: color, color }} />
      </span>
      <span
        className="text-[11px] font-bold uppercase leading-none"
        style={{ letterSpacing: "0.16em", color }}
      >
        {label}
      </span>
    </span>
  );
};


/* ------------------------------------------------------------ record tile */

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
        className="tabular mt-0.5 text-sm font-semibold leading-snug"
        style={{ color: "hsl(var(--v-card-fg))" }}
      >
        {value}
      </p>
    </div>
  </div>
);

/* ------------------------------------------------------------ vetting grid */

const VET_CARDS = [
  {
    Icon: ShieldCheck,
    label: "Background checked",
    line: "Every Pro clears a Checkr background check before their first visit.",
  },
  {
    Icon: IdCard,
    label: "$1M liability insurance",
    line: "Every Pro carries their own policy, verified by Tidy, not just claimed.",
  },
  {
    Icon: Camera,
    label: "Photo-verified visits",
    line: "Before and after photos on every single job.",
  },
  {
    Icon: UserRound,
    label: "The same Pro every time",
    line: "You are assigned one Pro, not whoever is free that day.",
  },
];

const VettingGrid = () => (
  <section className="mt-10">
    <Reveal>
      <h2
        className="font-archivo text-center text-[19px] font-extrabold"
        style={{ letterSpacing: "-0.01em", color: "hsl(0 0% 100% / 0.95)" }}
      >
        How Tidy vets every Pro
      </h2>
    </Reveal>
    <div className="mt-5 grid grid-cols-2 gap-3">
      {VET_CARDS.map(({ Icon, label, line }, i) => (
        <Reveal key={label} delay={i * 90}>
          <div
            className="verify-lift h-full rounded-2xl p-4"
            style={{
              backgroundColor: "hsl(var(--v-navy-lift) / 0.72)",
              border: "1px solid hsl(0 0% 100% / 0.09)",
              boxShadow: "0 10px 24px -16px hsl(207 75% 4% / 0.8)",
            }}
          >
            <Icon
              className="verify-icon-draw verify-gold-icon h-[22px] w-[22px]"
              strokeWidth={1.6}
              style={{ color: "hsl(var(--gold))", animationDelay: `${i * 90}ms` }}
            />
            <p
              className="mt-3 text-[13.5px] font-bold leading-snug"
              style={{ color: "hsl(0 0% 100% / 0.96)" }}
            >
              {label}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: "hsl(0 0% 100% / 0.72)" }}>
              {line}
            </p>
          </div>
        </Reveal>
      ))}
    </div>
  </section>
);

/* --------------------------------------------------- badge diagram (404) */

const BadgeDiagram = () => {
  const callouts = [
    { label: "A photo of your Pro" },
    { label: "First name and last initial" },
    { label: "A Pro number, TIDY-0000" },
  ];
  return (
    <section className="mt-10">
      <Reveal>
        <h2
          className="font-archivo text-center text-[19px] font-extrabold"
          style={{ letterSpacing: "-0.01em", color: "hsl(0 0% 100% / 0.95)" }}
        >
          What a real Tidy badge looks like
        </h2>
      </Reveal>

      <Reveal delay={90}>
        <div
          className="mt-5 rounded-2xl p-5"
          style={{
            backgroundColor: "hsl(var(--v-navy-lift) / 0.72)",
            border: "1px solid hsl(0 0% 100% / 0.09)",
          }}
        >
          {/* illustrated badge */}
          <div
            className="mx-auto w-[186px] rounded-xl px-4 py-4 text-center"
            style={{ backgroundColor: "hsl(var(--v-card))", border: "1px solid hsl(var(--v-tile-border))" }}
          >
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: "hsl(var(--v-tile))", border: "2px solid hsl(var(--v-tile-border))" }}
            >
              <UserRound className="h-7 w-7" style={{ color: "hsl(var(--v-tile-fg))" }} />
            </div>
            <p
              className="font-archivo mt-2.5 text-[15px] font-extrabold"
              style={{ color: "hsl(var(--v-card-fg))" }}
            >
              James R.
            </p>
            <code
              className="tabular mt-1 inline-block rounded px-2 py-0.5 font-mono text-[11px] font-semibold"
              style={{
                letterSpacing: "0.08em",
                backgroundColor: "hsl(var(--v-tile))",
                color: "hsl(var(--primary))",
              }}
            >
              TIDY-0421
            </code>
          </div>

          <ul className="mt-5 space-y-3">
            {callouts.map((c, i) => (
              <Reveal as="li" key={c.label} delay={180 + i * 90}>
                <span className="flex items-center gap-3">
                  <span
                    className="h-px w-8 shrink-0"
                    style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold)))" }}
                  />
                  <span className="text-[13px]" style={{ color: "hsl(0 0% 100% / 0.85)" }}>
                    {c.label}
                  </span>
                </span>
              </Reveal>
            ))}
          </ul>
        </div>
      </Reveal>

      <Reveal delay={120}>
        <p className="mt-4 text-center text-sm" style={{ color: "hsl(0 0% 100% / 0.75)" }}>
          If the badge in front of you is missing any of these, call us.
        </p>
      </Reveal>
    </section>
  );
};

/* -------------------------------------------------------- company block */

const CompanyBlock = () => (
  <Reveal>
    <section
      className="relative mt-10 overflow-hidden rounded-2xl px-5 py-6 text-center"
      style={{ backgroundColor: "hsl(var(--v-navy-lift) / 0.85)" }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold)), transparent)" }}
      />
      <div className="flex h-9 items-center justify-center [&_img]:!h-9 [&_img]:!w-auto">
        <TidyLogo size="sm" />
      </div>
      <p className="mt-3 text-sm font-bold" style={{ color: "hsl(0 0% 100% / 0.95)" }}>
        Tidy Home Concierge LLC
      </p>
      <p className="mt-1 text-[13px]" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
        Licensed and insured · Miami, Florida
      </p>

      <dl className="mt-5 space-y-2.5 text-left">
        {[
          ["Serving", "Pinecrest · Kendall · Kendall West"],
          ["Hours", "Monday to Saturday, 8am to 6pm"],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[13px]">
            <dt className="w-[68px] shrink-0 font-semibold" style={{ color: "hsl(0 0% 100% / 0.58)" }}>
              {k}
            </dt>
            <dd style={{ color: "hsl(0 0% 100% / 0.92)" }}>{v}</dd>
          </div>
        ))}
        <div className="flex gap-3 text-[13px]">
          <dt className="w-[68px] shrink-0 font-semibold" style={{ color: "hsl(0 0% 100% / 0.58)" }}>
            Contact
          </dt>
          <dd style={{ color: "hsl(0 0% 100% / 0.92)" }}>
            <a href={PHONE_TEL} className="tabular font-semibold underline underline-offset-2">
              {PHONE_DISPLAY}
            </a>
            {" · "}
            <a href={`mailto:${EMAIL}`} className="underline underline-offset-2">
              {EMAIL}
            </a>
          </dd>
        </div>
      </dl>

      <p className="mt-5 text-[13px]" style={{ color: "hsl(0 0% 100% / 0.62)" }}>
        Home care on a schedule. More life. Less chores.{" "}
        <a href="https://jointidy.co" className="underline underline-offset-2" style={{ color: "hsl(0 0% 100% / 0.85)" }}>
          jointidy.co
        </a>
      </p>
    </section>
  </Reveal>
);

/* ------------------------------------------------------------------ page */

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
      const status = row.badge_status ?? "notissued";
      if (status === "active") setState("active");
      else if (status === "suspended") setState("suspended");
      else if (status === "revoked") setState("revoked");
      else setState("notissued");
    })();
    return () => { cancelled = true; };
  }, [token]);

  const since = monthYear(pro?.pro_since ?? null);
  const cleared = longDate(pro?.bg_check_cleared_at ?? null);
  const services = serviceLabel(pro?.services ?? null);
  const showPhoto = state === "active" || state === "suspended" || state === "revoked";

  const buttonBase =
    "verify-press mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold";

  return (
    <div
      className="verify-page relative min-h-screen px-4 py-7 sm:py-12"
      style={{ backgroundColor: "hsl(var(--v-navy))" }}
    >
      <Helmet>
        <title>Verify a Tidy Pro badge</title>
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
        <meta name="googlebot" content="noindex, nofollow" />
      </Helmet>

      <Ground />

      <main className="relative mx-auto w-full max-w-[26.25rem]">
        <section
          className="verify-glass verify-sweep relative overflow-hidden"
          style={{
            backgroundColor: "hsl(var(--v-card) / 0.92)",
            borderTop: "1px solid hsl(0 0% 100% / 0.9)",
            border: "1px solid hsl(var(--v-hairline) / 0.9)",
          }}
        >
          <div className="relative px-6 pb-7 pt-8 sm:px-8">
            <div className="flex h-10 items-center justify-center [&_img]:!h-10 [&_img]:!w-auto">
              <TidyLogo size="sm" priority />
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
              <div className="mt-6 text-center">
                <div className="relative mx-auto h-[140px] w-[140px]">
                  {/* the seal drawing itself around the photo, once */}
                  {state === "active" && (
                    <svg viewBox="0 0 140 140" className="absolute -inset-[10px] h-[160px] w-[160px]" aria-hidden>
                      <circle
                        className="verify-seal"
                        cx="70"
                        cy="70"
                        r="67"
                        fill="none"
                        stroke="hsl(var(--gold))"
                        strokeWidth="3"
                        strokeLinecap="round"
                        transform="rotate(-90 70 70)"
                      />
                    </svg>
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
                </div>

                <div className="mt-5 flex justify-center">
                  <StatusOrb
                    tone={state === "active" ? "green" : "amberred"}
                    label={state === "active" ? "Verified" : state === "suspended" ? "Suspended" : state === "revoked" ? "Revoked" : "Not active"}
                  />
                </div>

                <h1
                  className="font-archivo mt-4 text-[32px] font-extrabold leading-[1.05]"
                  style={{
                    letterSpacing: "-0.02em",
                    color: state === "active" ? "hsl(var(--v-card-fg))" : "hsl(var(--v-muted-fg))",
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
                    className="tabular rounded-md px-2 py-0.5 font-mono text-xs font-semibold"
                    style={{
                      letterSpacing: "0.08em",
                      backgroundColor: "hsl(var(--v-tile))",
                      border: "1px solid hsl(var(--v-tile-border))",
                      color: state === "active" ? "hsl(var(--primary))" : "hsl(var(--v-amberred))",
                    }}
                  >
                    {pro.pro_number ?? "—"}
                  </code>
                </div>

                {(state === "active" || state === "suspended") && services && (
                  <p
                    className="mt-3.5 inline-block rounded-lg px-3 py-1 text-xs font-semibold uppercase"
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

            {state === "notissued" && (
              <div className="mt-8 text-center">
                <StatusOrb tone="neutral" label="Unrecognised" />
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
                  style={{ background: "linear-gradient(90deg, transparent, hsl(var(--v-hairline)))" }}
                />
                <span className="mx-4 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "hsl(var(--gold))" }} />
                <span
                  className="h-px flex-1"
                  style={{ background: "linear-gradient(270deg, transparent, hsl(var(--v-hairline)))" }}
                />
              </div>
            )}

            {/* ---- Active: the record ---- */}
            {state === "active" && (
              <>
                <div className="mt-6 space-y-3">
                  <RecordTile
                    index={0}
                    icon={<Check className="h-[18px] w-[18px]" strokeWidth={3} />}
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

                <div
                  className="mt-6 rounded-2xl px-4 py-3.5 text-center"
                  style={{
                    backgroundColor: "hsl(var(--v-green) / 0.1)",
                    border: "1px solid hsl(var(--v-green) / 0.35)",
                  }}
                >
                  <p className="text-sm font-bold" style={{ color: "hsl(var(--v-green))" }}>
                    Good to go — this badge is active today.
                  </p>
                  <p className="mt-1 text-[12.5px]" style={{ color: "hsl(var(--v-muted-fg))" }}>
                    No need to call us.
                  </p>
                </div>

              </>
            )}

            {/* ---- Suspended / revoked: calm, factual, authoritative ---- */}
            {(state === "suspended" || state === "revoked") && (
              <>
                <div className="mt-6 space-y-3">
                  <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--v-card-fg))" }}>
                    {state === "revoked"
                      ? "This badge has been revoked. This person is no longer authorised to represent Tidy."
                      : "This badge is currently suspended. This person is not scheduled for visits right now."}
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
                  className={`${buttonBase} verify-flash-btn`}
                  style={{ backgroundColor: "hsl(var(--v-amberred))", color: "hsl(0 0% 100%)" }}
                >
                  <Phone className="h-4 w-4" /> Call Tidy now · {PHONE_DISPLAY}
                </a>
              </>
            )}

            {/* ---- Not issued / not found ---- */}
            {state === "notissued" && (
              <>
                <p className="mt-6 text-sm leading-relaxed" style={{ color: "hsl(var(--v-card-fg))" }}>
                  This badge was not issued by Tidy, or the code was mistyped.
                </p>
                <a
                  href={PHONE_TEL}
                  className={`${buttonBase} verify-flash-btn`}
                  style={{ backgroundColor: "hsl(var(--v-amberred))", color: "hsl(0 0% 100%)" }}
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
            {(state === "suspended" || state === "revoked" || state === "notissued") && (
              <p className="text-sm font-semibold" style={{ color: "hsl(var(--v-amberred))" }}>
                If you feel unsafe, call 911 first.
              </p>
            )}
          </div>
        </section>

        {/* ---- Below the fold ---- */}
        {state !== "loading" && (
          <>
            <VettingGrid />
            {state === "notfound" && <BadgeDiagram />}
            <CompanyBlock />
          </>
        )}
      </main>
    </div>
  );
};

export default VerifyPro;
