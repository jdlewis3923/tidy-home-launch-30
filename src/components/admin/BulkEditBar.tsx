/** Bulk edit stage and queue state for the selected applicants. Each change is audited per row. */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const STAGES = ["applied", "background_check_pending", "background_check_review", "interview", "interview_pending", "offer_sent", "contract_signed", "oriented", "active", "rejected"];
const QUEUE = ["not_contacted", "texted", "follow_up_due", "followed_up", "replied", "call_booked", "interviewed", "hold", "declined", "cold", "disqualified", "checkr", "insurance", "hired"];

export default function BulkEditBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [field, setField] = useState<"current_stage" | "queue_state">("queue_state");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  if (!ids.length) return null;
  const apply = async () => {
    if (!value) return toast.error("Pick a value");
    if (!confirm(`Set ${field === "current_stage" ? "stage" : "queue state"} to "${value.replace(/_/g, " ")}" for ${ids.length} people?`)) return;
    setBusy(true);
    const { error } = await supabase.from("applicants").update({ [field]: value } as never).in("id", ids);
    setBusy(false);
    if (error) return toast.error("Could not update", { description: error.message });
    toast.success(`Updated ${ids.length}`);
    onDone();
  };
  const opts = field === "current_stage" ? STAGES : QUEUE;
  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
      <strong>{ids.length} selected</strong>
      <select value={field} onChange={(e) => { setField(e.target.value as never); setValue(""); }} className="h-9 rounded-lg border px-2">
        <option value="queue_state">Queue state</option><option value="current_stage">Stage</option>
      </select>
      <select value={value} onChange={(e) => setValue(e.target.value)} className="h-9 rounded-lg border px-2">
        <option value="">Choose…</option>{opts.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
      </select>
      <button disabled={busy} onClick={apply} className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-900 px-3 font-bold text-white disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply
      </button>
      <button onClick={onDone} className="text-xs text-slate-600 underline">Clear</button>
    </div>
  );
}
