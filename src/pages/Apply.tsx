/**
 * Public Application Form — /apply
 *
 * Tidy-branded, mobile-first contractor intake.
 */
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  DollarSign,
  CalendarClock,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import TidyLogo from "@/components/TidyLogo";
import SeoHead from "@/components/landing/SeoHead";

type ServiceChoice = "cleaning" | "lawn" | "detail" | "multiple";
type ExpBucket = "1-2" | "3-5" | "5+";
type YesNo = "yes" | "no";

type Form = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  zip: string;
  service: ServiceChoice | "";
  experience: ExpBucket | "";
  has_vehicle: YesNo | "";
  has_supplies: YesNo | "";
  work_authorized: YesNo | "";
  description: string;
};

const EMPTY: Form = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  zip: "",
  service: "",
  experience: "",
  has_vehicle: "",
  has_supplies: "",
  work_authorized: "",
  description: "",
};

const PERKS = [
  { icon: DollarSign, title: "Weekly direct deposit", body: "Paid every Friday — no chasing invoices." },
  { icon: CalendarClock, title: "Predictable routes", body: "Recurring subscribers in 33156 / 33183 / 33186." },
  { icon: ShieldCheck, title: "We handle the admin", body: "Booking, billing, and customer support — all on us." },
  { icon: Sparkles, title: "Grow with the brand", body: "" },
];

const EXP_TO_YEARS: Record<ExpBucket, number> = { "1-2": 2, "3-5": 5, "5+": 6 };

export default function Apply() {
  const { t } = useLanguage();
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function YesNoBlock({
    label,
    value,
    onChange,
    name,
  }: {
    label: string;
    value: string;
    onChange: (v: YesNo) => void;
    name: string;
  }) {
    return (
      <RadioBlock
        label={label}
        value={value}
        onChange={(v) => onChange(v as YesNo)}
        options={[
          { v: "yes", l: t("Yes") },
          { v: "no", l: t("No") },
        ]}
        name={name}
        inline
      />
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.service) {
      toast({ title: t("Please pick a role"), variant: "destructive" });
      return;
    }
    if (!form.experience) {
      toast({ title: t("Please pick experience range"), variant: "destructive" });
      return;
    }
    if (!form.has_vehicle) {
      toast({ title: t("Reliable transportation?"), variant: "destructive" });
      return;
    }
    if (!form.has_supplies) {
      toast({ title: t("Professional equipment?"), variant: "destructive" });
      return;
    }
    if (!form.work_authorized) {
      toast({ title: t("US work authorization?"), variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        zip: form.zip.trim() || undefined,
        service: form.service,
        experience_bucket: form.experience,
        experience_years: EXP_TO_YEARS[form.experience as ExpBucket],
        has_vehicle: form.has_vehicle === "yes",
        has_supplies: form.has_supplies === "yes",
        work_authorized: form.work_authorized === "yes",
        description: form.description.trim() || undefined,
      };
      const { data, error } = await supabase.functions.invoke("submit-application", { body: payload });
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      console.error(err);
      toast({
        title: t("Could not submit"),
        description: err?.message ?? t("Please try again"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="min-h-screen bg-navy-deep relative overflow-hidden flex items-center justify-center p-6">
        <Helmet>
          <title>{t("Application received | Tidy")}</title>
        </Helmet>
        <div
          className="absolute inset-0 opacity-60 pointer-events-none"
          style={{ background: "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary)/0.25), transparent 70%)" }}
        />
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{ background: "radial-gradient(40% 40% at 80% 80%, hsl(var(--gold)/0.2), transparent 70%)" }}
        />
        <div className="relative max-w-lg w-full rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-10 text-center shadow-2xl animate-calm-rise">
          <div className="mx-auto h-16 w-16 rounded-full bg-gold/15 ring-1 ring-gold/40 flex items-center justify-center">
            <CheckCircle2 className="h-9 w-9 text-gold" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-black text-white tracking-tight">
            {t("Application received")}
          </h1>
          <p className="mt-3 text-white/70 leading-relaxed">
            {t("Thanks for applying. We'll review and be in touch within")}{" "}
            <span className="text-white font-semibold">{t("2–3 business days")}</span>.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gold text-navy-deep font-bold px-6 py-3 hover:brightness-110 transition"
          >
            <ArrowLeft className="h-4 w-4" /> {t("Back to Tidy")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy-deep relative overflow-hidden">
      <SeoHead
        title={t("Careers at Tidy — Apply to join Miami's home-service crew")}
        description={t("Join Tidy's contractor network in Kendall and Pinecrest. Cleaning, lawn care, and car detailing pros — weekly pay, predictable routes.")}
        canonical="https://jointidy.co/apply"
      />

      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.55), transparent 60%)" }}
        />
        <div
          className="absolute -bottom-40 -right-32 h-[480px] w-[480px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--gold)/0.55), transparent 60%)" }}
        />
      </div>

      <header className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 text-white/80 hover:text-white transition text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" /> {t("Back to site")}
        </Link>
        <Link to="/" aria-label="Tidy home">
          <TidyLogo size="sm" />
        </Link>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pb-20 pt-6 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-16 items-start">
        <section className="text-white animate-calm-rise">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-xs font-semibold tracking-wide uppercase text-white/80 ring-1 ring-white/15">
            <Sparkles className="h-3.5 w-3.5 text-gold" /> {t("Now hiring · Miami")}
          </span>
          <h1 className="mt-5 font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.98] text-balance">
            {t("Join our team —")}
            <span className="block bg-gradient-to-r from-gold via-gold to-amber-200 bg-clip-text text-transparent">
              {t("we bring the customers.")}
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base sm:text-lg text-white/70 leading-relaxed">
            {t(
              "Tidy is Miami's subscription home-service brand. We're hiring background-checked cleaners, lawn pros, and detailers in Kendall and Pinecrest.",
            )}
          </p>

          <div className="mt-10 grid sm:grid-cols-2 gap-4">
            {PERKS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl bg-white/[0.04] backdrop-blur border border-white/10 p-5 hover:bg-white/[0.07] hover:border-white/20 transition"
              >
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/30 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-white">{t(title)}</h3>
                {body ? (
                  <p className="mt-1 text-sm text-white/60 leading-relaxed">{t(body)}</p>
                ) : null}
              </div>
            ))}
</div>

          <div className="mt-10 rounded-xl bg-white/[0.04] backdrop-blur border border-white/10 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-gold" />
              <h2 className="font-display text-base font-bold text-white">{t("Insurance requirement")}</h2>
            </div>
            <p className="mt-3 text-sm text-white/70 leading-relaxed">
              {t(
                "Every Tidy Pro carries their own commercial general liability policy at $1,000,000 per occurrence / $2,000,000 aggregate, naming Tidy Home Concierge LLC as Additional Insured. It must be active and verified before your first visit.",
              )}
            </p>
            <p className="mt-2 text-sm text-white/70 leading-relaxed">
              {t(
                "No LLC is required and most solo operators pay about $25 to $60 a month; Hiscox and NEXT Insurance are the two carriers our Pros use.",
              )}
            </p>
            <div className="mt-3 rounded-xl bg-gold/10 ring-1 ring-gold/30 p-4">
              <p className="text-sm text-white/85 leading-relaxed">
                <span className="font-bold text-gold">{t("We reimburse up to $50 a month")}</span>{" "}
                {t(
                  "toward your premium for the first 3 months — paid with your Friday deposit once your certificate is verified.",
                )}
              </p>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-gold" /> 33156 · 33183 · 33186
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-gold" /> {t("Background check on every hire")}
            </span>
          </div>
        </section>

        <section className="relative">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-primary/30 via-transparent to-gold/20 opacity-60 blur-lg pointer-events-none" />
          <div className="relative rounded-2xl bg-white shadow-2xl border border-white/40 overflow-hidden animate-calm-rise">
            <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-hairline bg-cream">
              <h2 className="mt-1 font-display text-2xl font-black text-ink tracking-tight">
                {t("Apply to join Tidy")}
              </h2>
              <p className="mt-1 text-sm text-ink-faint">{t("Takes about 2 minutes.")}</p>
            </div>

            <form onSubmit={submit} className="px-6 sm:px-8 py-7 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="first_name" className="text-ink">
                    {t("First name")} *
                  </Label>
                  <Input
                    id="first_name"
                    required
                    value={form.first_name}
                    onChange={(e) => set("first_name", e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="last_name" className="text-ink">
                    {t("Last name")} *
                  </Label>
                  <Input
                    id="last_name"
                    required
                    value={form.last_name}
                    onChange={(e) => set("last_name", e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="email" className="text-ink">
                  {t("Email")} *
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone" className="text-ink">
                    {t("Phone")} *
                  </Label>
                  <Input
                    id="phone"
                    required
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="(786) 555-1234"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="zip" className="text-ink">
                    {t("ZIP code")} *
                  </Label>
                  <Input
                    id="zip"
                    required
                    maxLength={10}
                    value={form.zip}
                    onChange={(e) => set("zip", e.target.value)}
                    placeholder="33183"
                    className="mt-1.5"
                  />
                </div>
              </div>

              <RadioBlock
                label={t("Which service are you applying for?") + " *"}
                value={form.service}
                onChange={(v) => set("service", v as ServiceChoice)}
                options={[
                  { v: "cleaning", l: t("House Cleaning") },
                  { v: "lawn", l: t("Lawn Care") },
                  { v: "detail", l: t("Car Detailing") },
                  { v: "multiple", l: t("Multiple") },
                ]}
                name="service"
              />

              <RadioBlock
                label={t("Years of relevant experience") + " *"}
                value={form.experience}
                onChange={(v) => set("experience", v as ExpBucket)}
                options={[
                  { v: "1-2", l: t("1–2 years") },
                  { v: "3-5", l: t("3–5 years") },
                  { v: "5+", l: t("5+ years") },
                ]}
                name="experience"
                inline
              />

              <YesNoBlock
                label={t("Do you have your own reliable transportation?") + " *"}
                value={form.has_vehicle}
                onChange={(v) => set("has_vehicle", v)}
                name="vehicle"
              />
              <YesNoBlock
                label={t("Do you have your own professional equipment in working condition?") + " *"}
                value={form.has_supplies}
                onChange={(v) => set("has_supplies", v)}
                name="supplies"
              />
              <YesNoBlock
                label={t("Are you authorized to work in the United States?") + " *"}
                value={form.work_authorized}
                onChange={(v) => set("work_authorized", v)}
                name="workauth"
              />

              <div>
                <Label htmlFor="description" className="text-ink">
                  {t("Brief description of your relevant experience")}
                </Label>
                <Textarea
                  id="description"
                  rows={4}
                  maxLength={500}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className="mt-1.5"
                  placeholder={t("Tell us about your background in this service…")}
                />
                <p className="mt-1 text-xs text-ink-faint text-right">{form.description.length}/500</p>
              </div>

              <div className="rounded-xl border border-hairline bg-cream/60 p-4 text-xs text-ink leading-relaxed">
                {t(
                  "By submitting, you confirm Tidy may contact you about this role. You will undergo a background check at Tidy's expense if we move forward.",
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full bg-gradient-to-b from-navy-deep to-[#0b1226] text-white hover:brightness-110 font-bold text-base h-12 shadow-lg disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("Submitting…")}
                  </>
                ) : (
                  t("Submit application")
                )}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function RadioBlock({
  label,
  value,
  onChange,
  options,
  name,
  inline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
  name: string;
  inline?: boolean;
}) {
  return (
    <div>
      <Label className="text-ink">{label}</Label>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className={inline ? "mt-2 flex flex-wrap gap-3" : "mt-2 grid sm:grid-cols-2 gap-2"}
      >
        {options.map((o) => (
          <label
            key={o.v}
            htmlFor={`${name}-${o.v}`}
            className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm cursor-pointer transition ${value === o.v ? "border-primary bg-primary/5 text-ink" : "border-hairline text-ink hover:bg-cream/60"}`}
          >
            <RadioGroupItem id={`${name}-${o.v}`} value={o.v} />
            <span>{o.l}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
