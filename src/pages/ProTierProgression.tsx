/**
 * /pro/tier-progression — public-facing info page that explains how
 * Tidy's two-tier contractor structure works, what it takes to advance
 * from Tier 1 (Verified Pro) to Tier 2 (Pro Partner), and what the
 * 14-day COI upload window looks like after an offer is extended.
 */
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  ShieldCheck, Award, Star, XCircle, AlertOctagon, Camera, TrendingUp,
  CheckCircle2, ArrowLeft, ArrowRight, FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const CRITERIA = [
  { icon: TrendingUp, label: "50+ completed visits", desc: "Rolling 90-day window of paid, customer-verified visits." },
  { icon: Star, label: "4.8+ average rating", desc: "Customer ratings averaged across the same 90-day window." },
  { icon: XCircle, label: "<5% Pro-initiated cancel rate", desc: "Reschedules and cancels you initiate, divided by total accepted visits." },
  { icon: AlertOctagon, label: "<2% complaint rate", desc: "Verified service complaints filed by customers, divided by total visits." },
  { icon: Camera, label: "95%+ photo compliance", desc: "Before/after photos uploaded on every required visit." },
  { icon: ShieldCheck, label: "Zero open quality escalations", desc: "No active SOP or quality-team escalations on your account." },
];

const FAQ = [
  { q: "How do I know I'm eligible?", a: "We track all six metrics live. Once you've cleared every threshold for a full 90-day rolling window, your dashboard will switch the Tier 2 callout to 'Eligible' and Tidy support will reach out within 48 hours with an offer." },
  { q: "What if I drop below a threshold after I'm promoted?", a: "Tier 2 status is reviewed on a rolling basis. If your metrics slip, Tidy will move you back to Tier 1 with at least 30 days notice and a coaching plan to climb back." },
  { q: "Do I have to pay for the COI?", a: "Yes — Tier 2 requires you to carry your own commercial general liability ($1M/$2M aggregate) and commercial auto. Most Pros find competitive policies for $40–80/mo." },
  { q: "Can I stay at Tier 1 forever?", a: "Absolutely. Tier 1 is a permanent, supported home for Pros who prefer steady work without the overhead of a registered business." },
];

export default function ProTierProgression() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>How Tier Progression Works at Tidy</title>
        <meta name="description" content="Tidy's two-tier contractor structure — Verified Pro and Pro Partner — explained. See pay, criteria, COI process, and FAQs." />
      </Helmet>

      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link to="/pro" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        {/* Hero */}
        <div className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Tier progression</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mt-2">
            How Tier Progression Works at Tidy
          </h1>
          <p className="text-slate-600 mt-3 max-w-2xl mx-auto">
            Every Pro starts at Tier 1 with full Tidy backing. Earn Tier 2 to unlock premium pay, premium routes, and Pro Partner perks.
          </p>
        </div>

        {/* Side by side */}
        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-full bg-slate-900 p-2"><ShieldCheck className="h-5 w-5 text-white" /></div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tier 1</p>
                  <h3 className="text-xl font-bold text-slate-900">Tidy Verified Pro</h3>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">Default at hire. Tidy carries you.</p>
              <Row label="Pay split" value="40% to Pro" />
              <Row label="Per-visit floor" value="$25" />
              <Row label="Routes" value="Standard" />
              <Row label="Insurance" value="Tidy provides GL during assignments" />
              <Row label="Gear stipend" value="—" />
              <Row label="Badge" value="Verified Pro" />
            </CardContent>
          </Card>

          <Card className="border-amber-200 shadow-md" style={{ background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)" }}>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-full bg-slate-900 p-2"><Award className="h-5 w-5 text-amber-300" /></div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Tier 2 — earned</p>
                  <h3 className="text-xl font-bold text-slate-900">Tidy Pro Partner</h3>
                </div>
              </div>
              <p className="text-sm text-slate-700 mb-4">Unlocked after 50+ visits and consistent excellence.</p>
              <Row label="Pay split" value="45% to Pro" highlight />
              <Row label="Per-visit floor" value="$30" highlight />
              <Row label="Routes" value="Premium $2M+ homes" highlight />
              <Row label="Insurance" value="Pro carries own GL + auto COI" />
              <Row label="Gear stipend" value="$300/yr" highlight />
              <Row label="Badge" value="Pro Partner" highlight />
            </CardContent>
          </Card>
        </div>

        {/* Criteria */}
        <h2 className="text-2xl font-bold text-slate-900 mb-4">The 6 readiness criteria</h2>
        <p className="text-sm text-slate-600 mb-5">Measured on a rolling 90-day window. All six must be met to receive a Tier 2 offer.</p>
        <div className="grid gap-3 sm:grid-cols-2 mb-10">
          {CRITERIA.map(({ icon: Icon, label, desc }) => (
            <Card key={label} className="border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-emerald-50 p-2 text-emerald-700"><Icon className="h-4 w-4" /></div>
                  <div>
                    <p className="font-semibold text-slate-900">{label}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* COI process */}
        <h2 className="text-2xl font-bold text-slate-900 mb-4">The 14-day COI upload process</h2>
        <Card className="border-slate-200 mb-10">
          <CardContent className="p-6 space-y-4">
            {[
              { n: 1, title: "Day 0 — Tier 2 offer sent", body: "Once you meet all six criteria, Tidy emails and texts your Pro Partner offer with a secure upload link." },
              { n: 2, title: "Day 1–10 — Bind your policies", body: "Most Pros bind GL ($1M/$2M aggregate) and commercial auto in 24–72 hours. We provide a list of partner brokers." },
              { n: 3, title: "Day 11–14 — Upload COI", body: "Drop your Certificate of Insurance into /pro/upload-coi. Our team reviews within one business day." },
              { n: 4, title: "Confirmed", body: "On approval, your tier flips to Pro Partner instantly — pay split, floor, premium routes, and stipend all unlock automatically." },
            ].map((s) => (
              <div key={s.n} className="flex gap-4">
                <div className="shrink-0 h-8 w-8 rounded-full bg-slate-900 text-white text-sm font-bold grid place-items-center">{s.n}</div>
                <div>
                  <p className="font-semibold text-slate-900">{s.title}</p>
                  <p className="text-sm text-slate-600">{s.body}</p>
                </div>
              </div>
            ))}
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2">
              <FileText className="h-4 w-4 shrink-0 mt-0.5" />
              <span>If we don't receive a valid COI by Day 14, the offer expires and you stay at Tier 1. You can re-qualify at any time.</span>
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <h2 className="text-2xl font-bold text-slate-900 mb-4">FAQ</h2>
        <div className="space-y-3 mb-10">
          {FAQ.map((f) => (
            <Card key={f.q} className="border-slate-200">
              <CardContent className="p-4">
                <p className="font-semibold text-slate-900 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-1 text-emerald-600 shrink-0" />{f.q}
                </p>
                <p className="text-sm text-slate-600 mt-1.5 ml-6">{f.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Link to="/pro" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:underline">
          Back to my dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-t border-slate-200/60 py-2 first:border-t-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className={`text-sm tabular-nums ${highlight ? "font-bold text-amber-700" : "font-semibold text-slate-900"}`}>{value}</span>
    </div>
  );
}
