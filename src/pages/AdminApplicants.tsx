/**
 * Admin Applicants Pipeline — /admin/applicants (Phase A)
 *
 * Basic list view + detail modal with Manual Background Check controls
 * (CLEAR / CONSIDER / FAIL). No external provider wired yet — Justin
 * triggers each decision manually; downstream notifications + stage
 * transitions happen in the manual-bg-check edge function.
 */
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Loader2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Applicant = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  service: string | null;
  current_stage: string | null;
  stage_entered_at: string | null;
  bg_check_status: string | null;
  bg_check_provider: string | null;
  bg_check_notes: string | null;
  bg_check_completed_at: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  created_at: string;
  notes_for_admin: string | null;
};

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied",
  background_check_pending: "BG Check Pending",
  background_check_review: "BG Check Review",
  rejected: "Rejected",
  interview_pending: "Interview Pending",
};

const STAGE_TONE: Record<string, string> = {
  applied: "bg-slate-100 text-slate-700",
  background_check_pending: "bg-amber-100 text-amber-800",
  background_check_review: "bg-orange-100 text-orange-800",
  interview_pending: "bg-blue-100 text-blue-800",
  rejected: "bg-rose-100 text-rose-800",
};

const BG_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  clear: "bg-emerald-100 text-emerald-800",
  consider: "bg-orange-100 text-orange-800",
  fail: "bg-rose-100 text-rose-800",
};

function daysSince(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  return d === 0 ? "today" : `${d}d`;
}

export default function AdminApplicants() {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [rows, setRows] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "rejected">("all");
  const [open, setOpen] = useState<Applicant | null>(null);
  const [bgNotes, setBgNotes] = useState("");
  const [submitting, setSubmitting] = useState<null | "clear" | "consider" | "fail">(null);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("applicants")
      .select("id, first_name, last_name, email, phone, service, current_stage, stage_entered_at, bg_check_status, bg_check_provider, bg_check_notes, bg_check_completed_at, rejection_reason, rejected_at, created_at, notes_for_admin")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) console.error(error);
    setRows((data as unknown as Applicant[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!hasRole) return;
    fetchRows();
  }, [hasRole]);

  useEffect(() => {
    setBgNotes(open?.bg_check_notes ?? "");
  }, [open?.id]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "rejected") return rows.filter((r) => r.current_stage === "rejected");
    return rows.filter((r) => r.current_stage !== "rejected");
  }, [rows, filter]);

  const runDecision = async (decision: "clear" | "consider" | "fail") => {
    if (!open) return;
    setSubmitting(decision);
    const { data, error } = await supabase.functions.invoke("manual-bg-check", {
      body: { applicant_id: open.id, decision, notes: bgNotes || undefined },
    });
    setSubmitting(null);
    if (error || (data as any)?.error) {
      toast({ title: "Failed", description: error?.message ?? (data as any)?.error ?? "unknown", variant: "destructive" });
      return;
    }
    toast({
      title: `Marked ${decision.toUpperCase()}`,
      description: decision === "clear"
        ? "Advanced to interview_pending."
        : decision === "consider"
          ? "Flagged for review. SMS sent to Justin."
          : "Rejected. Applicant rejection email sent.",
    });
    setOpen(null);
    fetchRows();
  };

  if (roleLoading) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6" /></main>;
  }
  if (!hasRole) return <Navigate to="/" replace />;

  return (
    <main className="min-h-screen bg-slate-50">
      <Helmet><title>Applicants | Tidy Admin</title></Helmet>
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/kpis"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> KPIs</Button></Link>
            <h1 className="text-xl font-bold text-slate-900">Applicants pipeline</h1>
          </div>
          <div className="flex gap-1">
            {(["all", "active", "rejected"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center"><Loader2 className="animate-spin h-6 w-6 inline" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-slate-500">No applicants yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left p-3">Name</th>
                      <th className="text-left p-3">Service</th>
                      <th className="text-left p-3">Current stage</th>
                      <th className="text-left p-3">Days in stage</th>
                      <th className="text-left p-3">BG check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(a)}>
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{a.first_name} {a.last_name}</div>
                          <div className="text-xs text-slate-500">{a.email}</div>
                        </td>
                        <td className="p-3 capitalize text-slate-700">{a.service ?? "—"}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={STAGE_TONE[a.current_stage ?? ""] ?? "bg-slate-100"}>{STAGE_LABEL[a.current_stage ?? ""] ?? a.current_stage ?? "—"}</Badge>
                        </td>
                        <td className="p-3 text-slate-700">{daysSince(a.stage_entered_at ?? a.created_at)}</td>
                        <td className="p-3">
                          {a.bg_check_status ? (
                            <Badge variant="outline" className={BG_TONE[a.bg_check_status] ?? "bg-slate-100"}>{a.bg_check_status}</Badge>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{open?.first_name} {open?.last_name}</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-4 text-sm">
              <div className="space-y-3">
                <Row label="Email" value={open.email} />
                <Row label="Phone" value={open.phone ?? "—"} />
                <Row label="Service" value={open.service ?? "—"} />
                <Row label="Stage" value={STAGE_LABEL[open.current_stage ?? ""] ?? open.current_stage ?? "—"} />
                <Row label="Days in stage" value={daysSince(open.stage_entered_at ?? open.created_at)} />
                <Row label="BG status" value={open.bg_check_status ?? "—"} />
                <Row label="BG provider" value={open.bg_check_provider ?? "—"} />
                {open.bg_check_completed_at && (
                  <Row label="BG completed" value={new Date(open.bg_check_completed_at).toLocaleString()} />
                )}
                {open.rejection_reason && <Row label="Rejection reason" value={open.rejection_reason} />}
              </div>

              {open.notes_for_admin && (
                <div className="pt-2 border-t">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Notes from applicant</div>
                  <div className="text-slate-700 whitespace-pre-wrap">{open.notes_for_admin}</div>
                </div>
              )}

              <div className="pt-3 border-t">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Manual background check</div>
                <Textarea
                  placeholder="Notes (e.g. 'Self-reported clean record, will verify with paid provider before activation')"
                  value={bgNotes}
                  onChange={(e) => setBgNotes(e.target.value)}
                  className="mb-3"
                  rows={3}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    onClick={() => runDecision("clear")}
                    disabled={!!submitting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {submitting === "clear" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldCheck className="h-4 w-4 mr-1" />CLEAR</>}
                  </Button>
                  <Button
                    onClick={() => runDecision("consider")}
                    disabled={!!submitting}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    {submitting === "consider" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldAlert className="h-4 w-4 mr-1" />CONSIDER</>}
                  </Button>
                  <Button
                    onClick={() => runDecision("fail")}
                    disabled={!!submitting}
                    variant="destructive"
                  >
                    {submitting === "fail" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldX className="h-4 w-4 mr-1" />FAIL</>}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  CLEAR → interview_pending. CONSIDER → flagged for review (SMS to Justin). FAIL → auto-reject + branded rejection email.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 font-medium text-right break-all">{value}</span>
    </div>
  );
}
