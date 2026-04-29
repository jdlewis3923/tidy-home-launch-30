/**
 * Public Application Form — /apply
 *
 * Editorial recruiting page. Two-column layout: left = brand pitch + perks,
 * right = the application card. Same submit logic, same edge function.
 */
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, CheckCircle2, ArrowLeft, Sparkles, DollarSign,
  CalendarClock, ShieldCheck, MapPin, Star,
} from "lucide-react";
import TidyLogo from "@/components/TidyLogo";

type Form = {
  first_name: string; last_name: string; email: string; phone: string;
  service: "cleaning" | "lawn" | "detail" | "";
  zip: "33156" | "33183" | "33186" | "";
  experience_years: string;
  has_vehicle: boolean;
  has_supplies: boolean;
  notes_for_admin: string;
};

const EMPTY: Form = {
  first_name: "", last_name: "", email: "", phone: "",
  service: "", zip: "", experience_years: "",
  has_vehicle: false, has_supplies: false, notes_for_admin: "",
};

const PERKS = [
  { icon: DollarSign,    title: "Weekly direct deposit",   body: "Paid every Friday — no chasing invoices." },
  { icon: CalendarClock, title: "Predictable routes",      body: "Recurring subscribers in 33156 / 33183 / 33186." },
  { icon: ShieldCheck,   title: "We handle the admin",     body: "Booking, billing, and customer support — all on us." },
  { icon: Sparkles,      title: "Grow with the brand",     body: "Bonus rates for top-rated pros and bilingual crews." },
];

export default function Apply() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.service) { toast({ title: "Please pick a role", variant: "destructive" }); return; }
    if (!form.zip)     { toast({ title: "Please pick your ZIP code", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        service: form.service,
        zip: form.zip,
        has_vehicle: form.has_vehicle,
        has_supplies: form.has_supplies,
      };
      if (form.phone) payload.phone = form.phone.trim();
      if (form.experience_years) payload.experience_years = parseInt(form.experience_years, 10);
      if (form.notes_for_admin) payload.notes_for_admin = form.notes_for_admin.trim();

      const { error } = await supabase.functions.invoke("submit-application", { body: payload });
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Could not submit", description: err?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="min-h-screen bg-navy-deep relative overflow-hidden flex items-center justify-center p-6">
        <Helmet><title>Application received | Tidy</title></Helmet>
        {/* ambient glow */}
        <div className="absolute inset-0 opacity-60 pointer-events-none"
             style={{ background: "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary)/0.25), transparent 70%)" }} />
        <div className="absolute inset-0 opacity-40 pointer-events-none"
             style={{ background: "radial-gradient(40% 40% at 80% 80%, hsl(var(--gold)/0.2), transparent 70%)" }} />
        <div className="relative max-w-lg w-full rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-10 text-center shadow-2xl animate-calm-rise">
          <div className="mx-auto h-16 w-16 rounded-full bg-gold/15 ring-1 ring-gold/40 flex items-center justify-center">
            <CheckCircle2 className="h-9 w-9 text-gold" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-black text-white tracking-tight">Application received</h1>
          <p className="mt-3 text-white/70 leading-relaxed">
            Thanks for applying to Tidy. Our team reviews every submission personally —
            expect to hear from us within <span className="text-white font-semibold">5 business days</span>.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gold text-navy-deep font-bold px-6 py-3 hover:brightness-110 transition"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Tidy
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy-deep relative overflow-hidden">
      <Helmet>
        <title>Careers at Tidy — Apply to join Miami's home-service crew</title>
        <meta name="description" content="Join Tidy's contractor network in Kendall, Pinecrest & Kendall West. Cleaning, lawn care, and car detailing pros — weekly pay, predictable routes." />
      </Helmet>

      {/* Ambient brand light */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.55), transparent 60%)" }} />
        <div className="absolute -bottom-40 -right-32 h-[480px] w-[480px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, hsl(var(--gold)/0.55), transparent 60%)" }} />
        <div className="absolute inset-0 opacity-[0.04]"
             style={{
               backgroundImage:
                 "linear-gradient(hsl(0 0% 100% / 0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.6) 1px, transparent 1px)",
               backgroundSize: "48px 48px",
             }} />
      </div>

      {/* Slim top bar */}
      <header className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white/80 hover:text-white transition text-sm font-semibold">
          <ArrowLeft className="h-4 w-4" /> Back to site
        </Link>
        <Link to="/" aria-label="Tidy home"><TidyLogo size="sm" /></Link>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pb-20 pt-6 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-16 items-start">
        {/* LEFT: Editorial pitch */}
        <section className="text-white animate-calm-rise">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-xs font-semibold tracking-wide uppercase text-white/80 ring-1 ring-white/15">
            <Sparkles className="h-3.5 w-3.5 text-gold" /> Now hiring · Miami
          </span>
          <h1 className="mt-5 font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.98] text-balance">
            Build a steady book of business —
            <span className="block bg-gradient-to-r from-gold via-gold to-amber-200 bg-clip-text text-transparent">
              we bring the customers.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base sm:text-lg text-white/70 leading-relaxed">
            Tidy is Miami's subscription home-service brand. We're hiring vetted
            cleaners, lawn pros, and detailers in Kendall, Pinecrest, and Kendall West.
            Apply once — we handle bookings, billing, and customer support so you can
            focus on the work.
          </p>

          {/* perks grid */}
          <div className="mt-10 grid sm:grid-cols-2 gap-4">
            {PERKS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-xl bg-white/[0.04] backdrop-blur border border-white/10 p-5 hover:bg-white/[0.07] hover:border-white/20 transition"
              >
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/30 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-white">{title}</h3>
                <p className="mt-1 text-sm text-white/60 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          {/* trust strip */}
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-gold" /> 33156 · 33183 · 33186
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-4 w-4 text-gold fill-gold" /> 5.0 average customer rating
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-gold" /> Background check on every hire
            </span>
          </div>
        </section>

        {/* RIGHT: Premium application card */}
        <section className="relative">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-primary/30 via-transparent to-gold/20 opacity-60 blur-lg pointer-events-none" />
          <div className="relative rounded-2xl bg-white shadow-2xl border border-white/40 overflow-hidden animate-calm-rise">
            <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-hairline bg-cream">
              <h2 className="font-display text-2xl font-black text-ink tracking-tight">Apply to join Tidy</h2>
              <p className="mt-1 text-sm text-ink-faint">Takes about 2 minutes. Miami-based pros only.</p>
            </div>

            <form onSubmit={submit} className="px-6 sm:px-8 py-7 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="first_name" className="text-ink">First name *</Label>
                  <Input id="first_name" required value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="last_name" className="text-ink">Last name *</Label>
                  <Input id="last_name" required value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className="mt-1.5" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email" className="text-ink">Email *</Label>
                  <Input id="email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-ink">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(786) 555-1234" className="mt-1.5" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-ink">Role *</Label>
                  <Select value={form.service} onValueChange={(v) => set("service", v as Form["service"])}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick one" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cleaning">House cleaning</SelectItem>
                      <SelectItem value="lawn">Lawn care</SelectItem>
                      <SelectItem value="detail">Car detailing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-ink">ZIP code *</Label>
                  <Select value={form.zip} onValueChange={(v) => set("zip", v as Form["zip"])}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick one" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="33156">33156 — Pinecrest</SelectItem>
                      <SelectItem value="33183">33183 — Kendall</SelectItem>
                      <SelectItem value="33186">33186 — Kendall West</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="experience_years" className="text-ink">Years of experience</Label>
                <Input
                  id="experience_years" type="number" min={0} max={60}
                  value={form.experience_years}
                  onChange={(e) => set("experience_years", e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div className="rounded-xl border border-hairline bg-cream/60 p-4 space-y-3">
                <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
                  <Checkbox checked={form.has_vehicle} onCheckedChange={(v) => set("has_vehicle", !!v)} className="mt-0.5" />
                  <span>I have my own vehicle</span>
                </label>
                <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
                  <Checkbox checked={form.has_supplies} onCheckedChange={(v) => set("has_supplies", !!v)} className="mt-0.5" />
                  <span>I have my own supplies / equipment</span>
                </label>
              </div>

              <div>
                <Label htmlFor="notes" className="text-ink">Anything we should know? <span className="text-ink-faint font-normal">(optional)</span></Label>
                <Textarea id="notes" rows={3} value={form.notes_for_admin} onChange={(e) => set("notes_for_admin", e.target.value)} className="mt-1.5" />
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full bg-gold text-navy-deep hover:bg-gold/90 font-bold text-base h-12 shadow-lg shadow-gold/20"
              >
                {submitting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
                  : "Submit application"}
              </Button>
              <p className="text-xs text-ink-faint text-center leading-relaxed">
                By submitting, you authorize Tidy to run a standard background check.
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
