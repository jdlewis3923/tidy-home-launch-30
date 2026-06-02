/**
 * Pro Training Quiz — /pro/training
 *
 * 10 hardcoded questions. Client lets contractor pick answers; on submit
 * we POST the full answer map to the `training-submit` edge function which
 * scores authoritatively and flips applicants.training_passed if >= 8/10.
 */
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, RotateCcw, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { QUESTIONS, PASS_THRESHOLD } from "@/lib/trainingQuestions";
import tidyLogo from "@/assets/tidy-logo.png";

export default function ProTraining() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session?.user));
  }, []);

  const allAnswered = useMemo(
    () => QUESTIONS.every((q) => typeof answers[q.id] === "number"),
    [answers],
  );

  if (authed === false) return <Navigate to="/login?next=/pro/training" replace />;

  const submit = async () => {
    if (!allAnswered) {
      toast.error("Please answer every question before submitting.");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("training-submit", { body: { answers } });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast.error("Submit failed", { description: error?.message ?? (data as any)?.error ?? "unknown" });
      return;
    }
    const d = data as { score: number; total: number; passed: boolean };
    setResult(d);
    if (d.passed) toast.success(`Passed — ${d.score}/${d.total}!`);
    else toast.warning(`Score: ${d.score}/${d.total} — passing is ${PASS_THRESHOLD}/${d.total}.`);
  };

  const retake = () => { setAnswers({}); setResult(null); };

  return (
    <div className="min-h-screen bg-white text-navy">
      <Helmet><title>Training Quiz — Tidy Pro</title></Helmet>

      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/pro/onboarding" className="flex items-center gap-2 text-sm text-slate-500 hover:text-navy">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <img src={tidyLogo} alt="Tidy" className="h-8 w-auto" />
          <span className="text-xs font-semibold text-primary">Training</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {result ? (
          <div className={`rounded-2xl border p-6 text-center ${result.passed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            {result.passed ? (
              <Trophy className="h-12 w-12 text-emerald-600 mx-auto" />
            ) : (
              <XCircle className="h-12 w-12 text-amber-600 mx-auto" />
            )}
            <h1 className="mt-3 text-2xl font-bold">
              {result.passed ? "You passed!" : "Not quite there yet"}
            </h1>
            <p className="mt-2 text-slate-700">
              You scored <strong>{result.score}/{result.total}</strong>. Passing is {PASS_THRESHOLD}/{result.total}.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              {result.passed ? (
                <Button onClick={() => navigate("/pro/onboarding")} className="bg-primary hover:bg-primary-deep">
                  Back to onboarding
                </Button>
              ) : (
                <Button onClick={retake} className="bg-primary hover:bg-primary-deep">
                  <RotateCcw className="h-4 w-4 mr-2" /> Retake quiz
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">Step 2 of 3</p>
            <h1 className="font-display text-3xl font-bold mt-2">Tidy Pro Training</h1>
            <p className="mt-2 text-slate-600 text-sm">
              {QUESTIONS.length} questions. Pass with {PASS_THRESHOLD} correct. You can retake immediately if you don't pass.
            </p>

            <div className="mt-8 space-y-6">
              {QUESTIONS.map((q, i) => (
                <fieldset key={q.id} className="rounded-2xl border border-slate-200 p-5">
                  <legend className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2">
                    Question {i + 1}
                  </legend>
                  <p className="font-semibold text-navy mb-3">{q.prompt}</p>
                  <div className="space-y-2">
                    {q.options.map((opt, idx) => {
                      const selected = answers[q.id] === idx;
                      return (
                        <label key={idx}
                          className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition
                            ${selected ? "border-primary bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                          <input
                            type="radio"
                            name={q.id}
                            checked={selected}
                            onChange={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}
                            className="mt-1 accent-primary"
                          />
                          <span className="text-sm text-navy">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-between gap-4 sticky bottom-4">
              <span className="text-xs text-slate-500">
                {Object.keys(answers).length}/{QUESTIONS.length} answered
              </span>
              <Button
                onClick={submit}
                disabled={!allAnswered || submitting}
                className="bg-gold hover:bg-gold/90 text-navy font-bold px-6"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Submit quiz
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
