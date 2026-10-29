/**
 * Scorecards — /admin/hiring/phone/:id, /admin/hiring/ref/:id, /admin/hiring/interview/:id (hiring v5)
 * One component, three kinds. PASS rules enforced client-side and re-checked on save.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Kind = "phone" | "reference" | "interview";

const PHONE_QS = [
  ["K1", "Confirmed identity and the service they applied for"],
  ["K2", "Walked through their last job and why it ended"],
  ["K3", "Equipment ownership matches the checklist they submitted"],
  ["K4", "Availability matches what they wrote (days, blocks)"],
  ["K5", "Income goal vs. realistic day pay discussed openly"],
  ["K6", "Other job / commitments won't collide with their days"],
  ["K7", "Understands 1099 contractor + own insurance"],
  ["K8", "Understands background check (Tidy pays)"],
  ["K9", "Communication: clear, prompt, professional on the call"],
  ["K10", "Overall: would you want this person in a member's home?"],
];
const PHONE_FLAGS = [
  ["P1", "Sounded rushed or evasive about work history"],
  ["P2", "Income expectation far above realistic day pay"],
  ["P3", "Hesitant about insurance or background check"],
  ["P4", "Poor phone manner (hard to understand, dismissive)"],
];
const REF_QS = [
  ["R1", "Reference confirmed they supervised or hired the candidate"],
  ["R2", "Confirmed the dates and role the candidate gave"],
  ["R3", "Reliability: showed up, on time, few absences"],
  ["R4", "Quality: work met expectations without supervision"],
  ["R5", "Would hire again — an unhesitating yes"],
];
const INTERVIEW_QS = [
  ["I1", "Arrived on time (or early)"],
  ["I2", "Presented cleanly — this person meets members"],
  ["I3", "Equipment knowledge checks out live (demo-able skills)"],
  ["I4", "Re-asked wrong scenarios — answered correctly in person"],
  ["I5", "Talking points from the Fit Report addressed"],
  ["I6", "Understands the route build (lighter first weeks)"],
  ["I7", "Understands pay per visit, add-ons at 40%, one paid redo per member every 60 days at 50%; further required redos are unpaid"],
  ["I8", "Understands insurance requirement and reimbursement"],
  ["I9", "Wants the seat — energy, questions, commitment"],
  ["I10", "Overall: hire this person?"],
];

const CONFIG: Record<Kind, { title: string; qs: string[][]; passRule: string }> = {
  phone: { title: "Phone Scorecard", qs: PHONE_QS, passRule: "PASS needs all 10 checked and no flags." },
  reference: { title: "Reference Scorecard", qs: REF_QS, passRule: "PASS needs all 5 checked. Any unhesitating no = FAIL." },
  interview: { title: "In-Person Scorecard", qs: INTERVIEW_QS, passRule: "PASS needs all 10 checked and Intent ≥ 60." },
};

export default function HiringScorecard({ kind }: { kind: Kind }) {
  const { id } = useParams<{ id: string }>();
  const cfg = CONFIG[kind];
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [intent, setIntent] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [existing, setExisting] = useState<{ passed: boolean | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sc } = await supabase.from("hiring_scorecards").select("data, passed").eq("applicant_id", id).eq("kind", kind).maybeSingle();
      if (sc) {
        setExisting(sc);
        setChecks((sc.data as Record<string, Record<string, boolean>>)?.checks ?? {});
        setFlags((sc.data as Record<string, Record<string, boolean>>)?.flags ?? {});
        setNotes((sc.data as Record<string, string>)?.notes ?? "");
      }
      if (kind === "interview") {
        const { data: r } = await supabase.rpc("hiring_fit_report", { _id: id });
        if (r && typeof (r as { intent?: number }).intent === "number") setIntent((r as { intent: number }).intent);
      }
      setLoading(false);
    })();
  }, [id, kind]);

  const passed = useMemo(() => {
    const allChecked = cfg.qs.every(([k]) => checks[k]);
    const noFlags = Object.values(flags).every((f) => !f);
    if (kind === "interview") return allChecked && noFlags && (intent ?? 0) >= 60;
    return allChecked && noFlags;
  }, [checks, flags, cfg, kind, intent]);

  const save = async (pass: boolean) => {
    setSaving(true);
    const { error } = await supabase.from("hiring_scorecards").upsert({
      applicant_id: id, kind, passed: pass,
      data: { checks, flags, notes, intent_at_save: intent },
      completed_at: new Date().toISOString(),
    }, { onConflict: "applicant_id,kind" });
    if (error) toast({ title: error.message, variant: "destructive" });
    else {
      toast({ title: pass ? "Saved: PASS" : "Saved: FAIL" });
      if (pass && kind === "phone") {
        // Phone PASS → text the in-person booking link.
        await supabase.functions.invoke("pipeline-notify", { body: { applicant_id: id, event: "slot_reminder" } }).catch(() => undefined);
      }
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-1">{cfg.title}</h1>
      <p className="text-sm text-muted-foreground mb-6">{cfg.passRule}</p>
      {existing?.passed !== null && existing ? (
        <p className={`mb-4 font-semibold flex items-center gap-2 ${existing.passed ? "text-green-600" : "text-destructive"}`}>
          {existing.passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          Already completed: {existing.passed ? "PASS" : "FAIL"} — saving again overwrites.
        </p>
      ) : null}
      <div className="grid gap-2 mb-6">
        {cfg.qs.map(([k, label]) => (
          <label key={k} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${checks[k] ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            <input type="checkbox" className="mt-1" checked={!!checks[k]} onChange={(e) => setChecks((c) => ({ ...c, [k]: e.target.checked }))} />
            <span className="text-sm text-foreground"><span className="font-mono text-xs text-primary mr-1">{k}</span>{label}</span>
          </label>
        ))}
      </div>
      {kind === "phone" ? (
        <div className="grid gap-2 mb-6">
          <h2 className="font-semibold text-foreground">Flags</h2>
          {PHONE_FLAGS.map(([k, label]) => (
            <label key={k} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${flags[k] ? "border-destructive bg-destructive/5" : "border-border bg-card"}`}>
              <input type="checkbox" className="mt-1" checked={!!flags[k]} onChange={(e) => setFlags((f) => ({ ...f, [k]: e.target.checked }))} />
              <span className="text-sm text-foreground"><span className="font-mono text-xs text-destructive mr-1">{k}</span>{label}</span>
            </label>
          ))}
        </div>
      ) : null}
      {kind === "interview" && intent !== null ? (
        <p className={`mb-4 font-semibold ${intent >= 60 ? "text-green-600" : "text-destructive"}`}>Intent score: {intent} (needs ≥ 60)</p>
      ) : null}
      <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="mb-6" />
      <div className="flex gap-3">
        <Button className="flex-1" disabled={saving || !passed} onClick={() => save(true)}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save PASS"}
        </Button>
        <Button variant="destructive" className="flex-1" disabled={saving} onClick={() => save(false)}>Save FAIL</Button>
      </div>
      {!passed ? <p className="text-xs text-muted-foreground mt-2">PASS stays disabled until every box is checked{kind === "interview" ? " and Intent is 60+" : ""}.</p> : null}
    </div>
  );
}
