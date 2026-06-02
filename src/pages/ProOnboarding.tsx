/**
 * Pro Onboarding — /pro/onboarding
 *
 * Activation gate hub. Shows the contractor's progress on the 3 gates
 * required to start receiving jobs:
 *   1. Stripe Connect payouts setup
 *   2. Training quiz (pass 8/10)
 *   3. Equipment photos (every required item approved)
 *
 * COI / contracts live elsewhere (compliance_complete) — this page only
 * covers the new Phase-3 gates.
 */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { CheckCircle2, Circle, Clock, AlertTriangle, ArrowRight, CreditCard, GraduationCap, Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import tidyLogo from "@/assets/tidy-logo.png";

type ApplicantRow = {
  id: string;
  first_name: string;
  service: string | null;
  current_stage: string | null;
  compliance_complete: boolean | null;
  stripe_connect_complete: boolean;
  training_passed: boolean;
  equipment_approved: boolean;
  stripe_account_id: string | null;
};

export default function ProOnboarding() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [applicant, setApplicant] = useState<ApplicantRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripeLoading, setStripeLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) { setAuthed(false); return; }
      setAuthed(true);
      const { data, error } = await supabase
        .from("applicants")
        .select("id, first_name, service, current_stage, compliance_complete, stripe_connect_complete, training_passed, equipment_approved, stripe_account_id")
        .eq("contractor_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) toast.error("Could not load onboarding", { description: error.message });
      setApplicant(data as ApplicantRow | null);
      setLoading(false);
    })();

    const ch = supabase.channel("pro-onboarding")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "applicants" }, () => {
        // re-fetch on any update; cheap since one row.
        supabase.auth.getSession().then(({ data: s }) => {
          const uid = s.session?.user?.id;
          if (!uid) return;
          supabase.from("applicants")
            .select("id, first_name, service, current_stage, compliance_complete, stripe_connect_complete, training_passed, equipment_approved, stripe_account_id")
            .eq("contractor_id", uid).maybeSingle()
            .then(({ data }) => { if (!cancelled) setApplicant(data as ApplicantRow | null); });
        });
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  if (authed === false) return <Navigate to="/login?next=/pro/onboarding" replace />;

  const startStripe = async () => {
    setStripeLoading(true);
    const { data, error } = await supabase.functions.invoke("stripe-connect-create", { body: {} });
    setStripeLoading(false);
    const url = (data as any)?.url ?? (data as any)?.onboarding_url;
    if (error || !url) {
      toast.error("Could not start payouts setup", { description: error?.message ?? (data as any)?.error ?? "unknown" });
      return;
    }
    window.location.href = url;
  };

  const gates = applicant ? [
    {
      key: "stripe",
      icon: <CreditCard className="h-5 w-5" />,
      title: "Set up payouts",
      body: "Connect a Stripe Express account so Tidy can deposit your earnings weekly.",
      done: applicant.stripe_connect_complete,
      action: (
        <Button onClick={startStripe} disabled={stripeLoading} className="bg-primary hover:bg-primary-deep">
          {stripeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {applicant.stripe_account_id ? "Continue Stripe setup" : "Start Stripe setup"}
        </Button>
      ),
    },
    {
      key: "training",
      icon: <GraduationCap className="h-5 w-5" />,
      title: "Pass the training quiz",
      body: "10 short questions on jobsite conduct, photos, payments, and safety. Pass with 8 correct.",
      done: applicant.training_passed,
      action: (
        <Button asChild className="bg-primary hover:bg-primary-deep">
          <Link to="/pro/training">Start quiz <ArrowRight className="h-4 w-4 ml-1" /></Link>
        </Button>
      ),
    },
    {
      key: "equipment",
      icon: <Camera className="h-5 w-5" />,
      title: "Upload equipment photos",
      body: "Photograph each required tool. Tidy reviews within 24 hours.",
      done: applicant.equipment_approved,
      action: (
        <Button asChild className="bg-primary hover:bg-primary-deep">
          <Link to="/pro/equipment">Upload photos <ArrowRight className="h-4 w-4 ml-1" /></Link>
        </Button>
      ),
    },
  ] : [];

  const complete = gates.every((g) => g.done);
  const completeCount = gates.filter((g) => g.done).length;

  return (
    <div className="min-h-screen bg-white text-navy">
      <Helmet><title>Pro Onboarding — Tidy</title></Helmet>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/pro" className="flex items-center gap-3">
            <img src={tidyLogo} alt="Tidy" className="h-10 w-auto" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Pro App</p>
              <p className="text-sm font-semibold text-navy -mt-0.5">Onboarding</p>
            </div>
          </Link>
          <Link to="/pro" className="text-sm text-slate-500 hover:text-navy">Back to dashboard</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {loading ? (
          <div className="text-slate-400 text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your onboarding status…
          </div>
        ) : !applicant ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h2 className="font-semibold text-navy">No applicant profile linked</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Your account isn't linked to an applicant record yet. Please contact Tidy support.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">Activation checklist</p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold mt-2">
              Welcome, {applicant.first_name}. Let's finish setup.
            </h1>
            <p className="mt-2 text-slate-600">
              {complete
                ? "Every step is done. Tidy is reviewing your activation — you'll get an email when jobs start routing to you."
                : `${completeCount} of ${gates.length} complete. Finish all three to start receiving jobs.`}
            </p>

            {applicant.compliance_complete === false && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <strong>Compliance still pending.</strong> Background check, COI, and contracts must
                also be complete before activation. <Link to="/pro/upload-coi" className="underline">Upload COI</Link>.
              </div>
            )}

            <div className="mt-8 space-y-3">
              {gates.map((g, i) => (
                <div key={g.key}
                  className={`rounded-2xl border p-5 ${g.done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-start gap-4">
                    <div className={`mt-0.5 ${g.done ? "text-emerald-600" : "text-slate-400"}`}>
                      {g.done ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                        <span>Step {i + 1}</span>
                        {g.done && <span className="text-emerald-700">· Complete</span>}
                      </div>
                      <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-navy">
                        <span className="text-primary">{g.icon}</span> {g.title}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">{g.body}</p>
                      {!g.done && <div className="mt-3">{g.action}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {complete && applicant.current_stage !== "active" && (
              <div className="mt-8 rounded-2xl border border-primary/30 bg-blue-50 p-5 flex items-start gap-3">
                <Clock className="h-5 w-5 text-primary mt-0.5" />
                <div className="text-sm text-navy">
                  <strong>Activation pending Tidy review.</strong> All your gates are green —
                  an admin will activate your account shortly.
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
