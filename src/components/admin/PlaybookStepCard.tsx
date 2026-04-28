/**
 * PlaybookStepCard — Expandable runbook for a single step.
 *
 * Shows: WHY, HOW (numbered sub-steps with optional URLs),
 * AUTO action (calls kpi-recovery-action), PREDICTED impact,
 * Mark Done + free-text notes (saved to kpi_step_completions).
 *
 * Falls back gracefully when no detailed content exists for a step
 * (uses the legacy one-line label).
 */
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Zap, Hand, Info, CheckCircle2, AlertTriangle, Loader2, NotebookPen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type ActionType = "AUTO" | "MANUAL" | "INFO";

export interface PlaybookStepDetail {
  step_index: number;
  label: string;
  why_text: string;
  how_steps: Array<{ text: string; url?: string }>;
  action_type: ActionType;
  action_key: string | null;
  predicted_impact_text: string | null;
  predicted_impact_cents: number | null;
  external_url: string | null;
}

interface CompletionRow {
  id: string;
  step_index: number;
  notes: string | null;
  completed_at: string;
}

function actionTypeStyles(t: ActionType) {
  if (t === "AUTO") return { cls: "bg-[#f5c518]/15 text-[#7a5a00] border-[#f5c518]/40", icon: <Zap className="h-3 w-3" /> };
  if (t === "MANUAL") return { cls: "bg-slate-100 text-slate-700 border-slate-300", icon: <Hand className="h-3 w-3" /> };
  return { cls: "bg-blue-50 text-blue-700 border-blue-200", icon: <Info className="h-3 w-3" /> };
}

export function PlaybookStepCard({
  kpiCode,
  index,
  fallbackLabel,
  fallbackActionType,
  fallbackActionKey,
  detail,
  completion,
  onAfterChange,
}: {
  kpiCode: string;
  index: number;
  fallbackLabel: string;
  fallbackActionType: ActionType;
  fallbackActionKey?: string | null;
  detail?: PlaybookStepDetail;
  completion?: CompletionRow;
  onAfterChange: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [savingDone, setSavingDone] = useState(false);
  const [notes, setNotes] = useState(completion?.notes ?? "");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { setNotes(completion?.notes ?? ""); }, [completion?.id]);

  const label = detail?.label ?? fallbackLabel;
  const actionType = detail?.action_type ?? fallbackActionType;
  const actionKey = detail?.action_key ?? fallbackActionKey ?? null;
  const at = actionTypeStyles(actionType);
  const done = !!completion;

  const runAuto = async () => {
    if (!actionKey) return;
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("kpi-recovery-action", {
        body: { kpi_code: kpiCode, action_key: actionKey, action_label: label },
      });
      if (error) throw error;
      setResult({ ok: true, msg: (data as { message?: string })?.message ?? "Action queued." });
      onAfterChange();
    } catch (err) {
      setResult({
        ok: false,
        msg: err instanceof Error ? err.message : "Handler not yet implemented.",
      });
    } finally {
      setRunning(false);
    }
  };

  const markDone = async () => {
    setSavingDone(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) throw new Error("Not signed in");
      if (done && completion) {
        // Toggle off — delete row
        await supabase.from("kpi_step_completions").delete().eq("id", completion.id);
      } else {
        await supabase.from("kpi_step_completions").insert({
          kpi_code: kpiCode,
          step_index: index,
          user_id: uid,
          notes: notes.trim() || null,
        });
      }
      onAfterChange();
    } finally {
      setSavingDone(false);
    }
  };

  const saveNotes = async () => {
    if (!completion) return;
    await supabase.from("kpi_step_completions").update({ notes: notes.trim() || null }).eq("id", completion.id);
    onAfterChange();
  };

  return (
    <li className={`rounded-lg border ${done ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200 bg-white"} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-3 py-3 flex items-start gap-3 hover:bg-slate-50/60 transition-colors"
      >
        <span className={`flex-shrink-0 h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center ${done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-700"}`}>
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${done ? "line-through text-slate-500" : "text-slate-900"}`}>{label}</p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${at.cls}`}>
              {at.icon}
              {actionType}
            </span>
            {detail?.predicted_impact_text && (
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                {detail.predicted_impact_text}
              </span>
            )}
            {!detail && (
              <span className="text-[10px] text-slate-400 italic">Tap for details (no runbook yet)</span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400 mt-1" /> : <ChevronDown className="h-4 w-4 text-slate-400 mt-1" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-100">
          {/* WHY */}
          {detail?.why_text ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#2563eb] mb-1">Why this matters</p>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{detail.why_text}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No "why" content has been written for this step yet. Add one in the kpi_playbook_steps table.</p>
          )}

          {/* HOW */}
          {detail?.how_steps && detail.how_steps.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#2563eb] mb-1">How to execute</p>
              <ol className="space-y-1.5 text-xs text-slate-800">
                {detail.how_steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-mono text-slate-400 shrink-0">{i + 1}.</span>
                    <span className="flex-1">
                      {s.text}
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 inline-flex items-center gap-0.5 text-[#2563eb] hover:underline font-medium"
                        >
                          open <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* AUTO + Done buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {actionType === "AUTO" && actionKey && (
              <Button
                size="sm"
                disabled={running}
                onClick={runAuto}
                className="h-8 px-3 text-xs bg-[#f5c518] hover:bg-[#e5b818] text-[#0f172a] font-semibold border-0"
              >
                {running ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                Run AUTO
              </Button>
            )}
            {detail?.external_url && (
              <Button asChild size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                <a href={detail.external_url} target="_blank" rel="noopener noreferrer">
                  Open tool <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant={done ? "outline" : "default"}
              disabled={savingDone}
              onClick={markDone}
              className={`h-8 px-3 text-xs ${done ? "border-emerald-300 text-emerald-700" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
            >
              {savingDone ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
              {done ? "Mark Undone" : "Mark Done"}
            </Button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1 mb-1">
              <NotebookPen className="h-3 w-3" /> Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={done ? saveNotes : undefined}
              placeholder={done ? "What did you observe? (saves on blur)" : "Notes will save when you mark this step done."}
              rows={2}
              className="w-full text-xs px-2 py-1.5 rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
            />
            {done && completion && (
              <p className="text-[10px] text-slate-500 mt-1">
                Done {new Date(completion.completed_at).toLocaleString()}
              </p>
            )}
          </div>

          {/* AUTO result */}
          {result && (
            <div className={`text-xs flex items-start gap-1.5 ${result.ok ? "text-emerald-700" : "text-amber-700"}`}>
              {result.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
              <span>{result.msg}</span>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
