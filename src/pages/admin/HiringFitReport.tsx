/**
 * Fit Report — /admin/hiring/fit/:id (hiring v5)
 * Live Skill / Reliability / Intent gauges, flags F1–F10, split talking points.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Flag, Phone, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Flag = { id: string; list: string; question: string };
type Report = {
  name: string; service: string; language: string; stage: string; legacy_application: boolean;
  skill: number; reliability: number; intent: number; skill_self_rated: boolean;
  bars: { key: string; label: string; value: number | null; core: boolean; demo: boolean }[];
  scenarios: { key: string; answer: string | null; correct: string | null; wrong: boolean }[];
  attendance: { late_3m: number; missed_12m: number; jobs_24m: number; late_response: string };
  flags: Flag[]; phone_talking_points: Flag[]; inperson_talking_points: Flag[];
  intent_adjustments: number;
};

function Gauge({ label, value, note }: { label: string; value: number; note?: string }) {
  const color = value >= 70 ? "text-green-600" : value >= 40 ? "text-amber-600" : "text-destructive";
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-center">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={`text-5xl font-bold my-2 ${color}`}>{value}</p>
      <div className="h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${value >= 70 ? "bg-green-600" : value >= 40 ? "bg-amber-500" : "bg-destructive"}`} style={{ width: `${value}%` }} /></div>
      {note ? <p className="text-xs text-muted-foreground mt-2">{note}</p> : null}
    </div>
  );
}

export default function HiringFitReport() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("hiring_fit_report", { _id: id });
    if (!error) setR(data as Report);
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const adjust = async () => {
    const d = Number(delta);
    if (!d || d < -10 || d > 10 || reason.trim().length < 5) {
      toast({ title: "Adjustment needs −10..+10 and a reason (5+ chars)", variant: "destructive" }); return;
    }
    const { error } = await supabase.from("intent_adjustments").insert({ applicant_id: id, delta: d, reason: reason.trim() });
    if (error) toast({ title: error.message, variant: "destructive" });
    else { setDelta(""); setReason(""); load(); }
  };

  if (loading || !r) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{r.name}</h1>
          <p className="text-muted-foreground text-sm">{r.service} · {r.language?.toUpperCase()} · {r.stage}{r.legacy_application ? " · legacy application" : ""}</p>
        </div>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Gauge label="Skill" value={r.skill} note={r.skill_self_rated ? "self-rated — verify live" : undefined} />
        <Gauge label="Reliability" value={r.reliability} />
        <Gauge label="Intent" value={r.intent} note={r.intent_adjustments ? `includes ${r.intent_adjustments > 0 ? "+" : ""}${r.intent_adjustments} manual` : undefined} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-3">Manual intent adjustment</h2>
        <div className="flex gap-2">
          <Input type="number" min={-10} max={10} value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="−10..+10" className="w-28" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="flex-1" />
          <Button onClick={adjust}>Apply</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Phone className="h-4 w-4" />Phone talking points</h2>
          {r.phone_talking_points.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
            <ul className="space-y-2">{r.phone_talking_points.map((f) => (
              <li key={f.id} className="text-sm text-foreground"><span className="font-mono text-xs text-primary mr-1">{f.id}</span>{f.question}</li>
            ))}</ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Users className="h-4 w-4" />In-person talking points</h2>
          {r.inperson_talking_points.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
            <ul className="space-y-2">{r.inperson_talking_points.map((f) => (
              <li key={f.id} className="text-sm text-foreground"><span className="font-mono text-xs text-primary mr-1">{f.id}</span>{f.question}</li>
            ))}</ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-3">Skill bars</h2>
        <div className="space-y-2">
          {r.bars.map((b) => (
            <div key={b.key} className="flex items-center gap-3">
              <span className="text-sm text-foreground w-64 truncate">{b.label}{b.core ? <span className="text-xs text-primary ml-1">core</span> : null}{b.demo ? <span className="text-xs text-amber-600 ml-1">demo</span> : null}</span>
              <div className="flex-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(b.value ?? 0) * 10}%` }} /></div>
              <span className="text-sm font-semibold text-foreground w-10 text-right">{b.value ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="font-semibold text-foreground mb-3">Scenarios</h2>
        <div className="space-y-1">
          {r.scenarios.map((s) => (
            <p key={s.key} className={`text-sm ${s.wrong ? "text-destructive font-medium" : "text-foreground"}`}>
              {s.key}: {s.answer ?? "—"}{s.wrong ? ` (correct: ${s.correct})` : ""}
            </p>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Flag className="h-4 w-4" />All flags</h2>
        {r.flags.length === 0 ? <p className="text-sm text-muted-foreground">No flags.</p> : (
          <ul className="space-y-2">{r.flags.map((f, i) => (
            <li key={i} className="text-sm text-foreground"><span className="font-mono text-xs text-primary mr-1">{f.id}</span>{f.question}</li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}
