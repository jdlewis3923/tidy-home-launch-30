/**
 * Admin Setup Check — /admin/setup-check
 *
 * Pre-flight launch readiness probe. Calls the `admin-setup-check` edge
 * function which probes Documenso, Stripe Connect, Checkr, Brevo (key + plan),
 * and verifies the required contractor PDFs are uploaded.
 *
 * Each check renders with a pass / warn / fail badge and a remediation hint.
 * The summary at the top mirrors what /admin/applicants surfaces as a banner.
 */
import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Status = "pass" | "warn" | "fail";
type Check = { id: string; label: string; status: Status; detail: string; remediation?: string };
type Result = { checks: Check[]; summary: { pass: number; warn: number; fail: number } };

const TONE: Record<Status, { bg: string; ring: string; text: string; Icon: typeof CheckCircle2 }> = {
  pass: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", Icon: CheckCircle2 },
  warn: { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-700",   Icon: AlertTriangle },
  fail: { bg: "bg-red-50",     ring: "ring-red-200",     text: "text-red-700",     Icon: XCircle },
};

export default function AdminSetupCheck() {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("admin-setup-check", { body: {} });
    setLoading(false);
    if (error || (data as any)?.error) {
      setError(error?.message ?? (data as any)?.error ?? "Failed to load");
      return;
    }
    setResult(data as Result);
  }, []);

  useEffect(() => { if (hasRole) run(); }, [hasRole, run]);

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#1FA1F0]" /></div>;
  }
  if (!hasRole) return <Navigate to="/" replace />;

  return (
    <main className="min-h-screen bg-slate-50">
      <Helmet><title>Setup Check — Tidy Admin</title></Helmet>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/admin/applicants" className="text-sm text-slate-500 hover:text-[#1FA1F0] inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to applicants
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0D1117] mt-2">Launch Readiness</h1>
            <p className="text-sm text-slate-500 mt-1">Verifies every integration the contractor pipeline depends on.</p>
          </div>
          <Button onClick={run} disabled={loading} variant="outline" className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-run
          </Button>
        </div>

        {error && (
          <Card className="mb-4 border-red-200 bg-red-50">
            <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        )}

        {result && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <SummaryCard tone="pass" count={result.summary.pass} label="Passing" />
            <SummaryCard tone="warn" count={result.summary.warn} label="Warnings" />
            <SummaryCard tone="fail" count={result.summary.fail} label="Failing" />
          </div>
        )}

        <div className="space-y-3">
          {loading && !result ? (
            <Card><CardContent className="p-6 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Probing integrations…</CardContent></Card>
          ) : result?.checks.map((c) => {
            const tone = TONE[c.status];
            const Icon = tone.Icon;
            return (
              <Card key={c.id} className={`border-slate-200`}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`rounded-full p-2 ${tone.bg} ring-1 ${tone.ring} shrink-0`}>
                    <Icon className={`h-5 w-5 ${tone.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-[#0D1117]">{c.label}</h3>
                      <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${tone.bg} ${tone.text} ring-1 ${tone.ring}`}>{c.status}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1 break-words">{c.detail}</p>
                    {c.remediation && c.status !== "pass" && (
                      <p className="text-xs text-slate-500 mt-2 italic">→ {c.remediation}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function SummaryCard({ tone, count, label }: { tone: Status; count: number; label: string }) {
  const t = TONE[tone];
  return (
    <div className={`rounded-2xl border ${t.ring} ${t.bg} p-4`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${t.text}`}>{label}</div>
      <div className="text-3xl font-bold text-[#0D1117] mt-1">{count}</div>
    </div>
  );
}
