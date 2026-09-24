/**
 * The whole Pro/applicant record, editable in place. Click a field, change it,
 * save — no reload. Gate answers are yes/no/unknown with a one-click
 * "Confirmed on call". Score and tier recompute on save unless set by hand
 * (then marked "score overridden by you" so the nightly job leaves them).
 * Every change is written to the audit list (database trigger) and Workday.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, History, Loader2, Pencil, PhoneCall, X } from "lucide-react";
import { GATES, scoreApplicant } from "@/lib/hiring/score";
import ProSendMenu from "@/components/admin/ProSendMenu";

type Kind = "text" | "number" | "bool" | "tri" | "select" | "date" | "list" | "longtext";
type Field = { key: string; label: string; kind: Kind; options?: string[]; table?: "kit" };

const STAGES = ["applied", "background_check_pending", "background_check_review", "interview", "interview_pending", "offer_sent", "contract_signed", "oriented", "active", "rejected"];
const QUEUE = ["not_contacted", "texted", "follow_up_due", "followed_up", "replied", "call_booked", "interviewed", "hold", "declined", "cold", "disqualified", "checkr", "insurance", "hired"];
const GATE_COL: Record<string, string> = { bilingual: "bilingual_gate" };
const GATE_LABEL: Record<string, string> = {
  bilingual: "Bilingual", drivers_license: "Driver's license", work_authorized: "Work authorization",
  own_equipment: "Own equipment", background_check_ok: "Background check willingness", reads_texts: "Reads texts",
};

const GROUPS: { title: string; fields: Field[] }[] = [
  { title: "Contact", fields: [
    { key: "first_name", label: "First name", kind: "text" }, { key: "last_name", label: "Last name", kind: "text" },
    { key: "email", label: "Email", kind: "text" }, { key: "phone", label: "Phone", kind: "text" },
    { key: "zip", label: "ZIP", kind: "text" }, { key: "city_or_zip", label: "City", kind: "text" },
    { key: "drive_minutes", label: "Drive time (min)", kind: "number" },
    { key: "service", label: "Service", kind: "select", options: ["cleaning", "lawn", "car_care", "ops_coordinator"] },
  ] },
  { title: "Experience", fields: [
    { key: "years_in_service", label: "Years of experience", kind: "number" },
    { key: "owner_operator", label: "Owner-operator", kind: "bool" }, { key: "has_insurance", label: "Has insurance", kind: "bool" },
    { key: "trade_job_current", label: "Currently working in the trade", kind: "bool" },
    { key: "experience_matches_resume", label: "Experience matches resume", kind: "tri" },
  ] },
  { title: "Pipeline", fields: [
    { key: "score", label: "Score", kind: "number" }, { key: "hiring_tier", label: "Tier", kind: "select", options: ["A", "B", "C"] },
    { key: "current_stage", label: "Stage", kind: "select", options: STAGES }, { key: "queue_state", label: "Queue state", kind: "select", options: QUEUE },
    { key: "pro_number", label: "Pro number", kind: "text" }, { key: "start_date", label: "Start date", kind: "date" },
    { key: "flags", label: "Flags (comma separated)", kind: "list" }, { key: "notes", label: "Notes", kind: "longtext" },
  ] },
  { title: "Kit and vehicle", fields: [
    { key: "shirt_size", label: "Shirt size", kind: "select", options: ["XS", "S", "M", "L", "XL", "2XL", "3XL"], table: "kit" },
    { key: "vest_size", label: "Vest size", kind: "text", table: "kit" },
    { key: "magnets_opt_in", label: "Magnet opt-in", kind: "bool", table: "kit" },
    { key: "vehicle_year", label: "Vehicle year", kind: "text", table: "kit" }, { key: "vehicle_make", label: "Vehicle make", kind: "text", table: "kit" },
    { key: "vehicle_model", label: "Vehicle model", kind: "text", table: "kit" }, { key: "vehicle_color", label: "Vehicle color", kind: "text", table: "kit" },
    { key: "expected_delivery_date", label: "Kit expected delivery", kind: "date", table: "kit" },
  ] },
];

const SCORE_KEYS = new Set(["service", "city_or_zip", "zip", "years_in_service", "owner_operator", "has_insurance", "trade_job_current", "experience_matches_resume", "notes", ...GATES.map((g) => GATE_COL[g] ?? g)]);

type Rec = Record<string, any>;
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") || "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

export default function ProRecordEditor({ applicantId, onSaved }: { applicantId: string; onSaved?: () => void }) {
  const [a, setA] = useState<Rec | null>(null);
  const [kit, setKit] = useState<Rec | null>(null);
  const [audit, setAudit] = useState<Rec[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: row }, { data: k }, { data: log }] = await Promise.all([
      supabase.from("applicants").select("*").eq("id", applicantId).maybeSingle(),
      supabase.from("pro_kit").select("*").eq("applicant_id", applicantId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("applicant_field_audit").select("*").eq("applicant_id", applicantId).order("changed_at", { ascending: false }).limit(40),
    ]);
    setA(row as Rec); setKit(k as Rec); setAudit((log ?? []) as Rec[]);
  }, [applicantId]);
  useEffect(() => { setEditing(null); void load(); }, [load]);

  const rescore = (next: Rec): Rec => {
    if (next.score_overridden) return {};
    const r = scoreApplicant({
      service: next.service, city_or_zip: next.city_or_zip ?? next.zip, applied_on: next.applied_on,
      years_in_service: next.years_in_service, owner_operator: next.owner_operator, has_insurance: next.has_insurance,
      trade_job_current: next.trade_job_current, experience_matches_resume: next.experience_matches_resume,
      tier_hint: next.tier_hint, notes: next.notes, bilingual: next.bilingual_gate, drivers_license: next.drivers_license,
      work_authorized: next.work_authorized, own_equipment: next.own_equipment, background_check_ok: next.background_check_ok,
      reads_texts: next.reads_texts, queue_state: next.queue_state,
    });
    return { score: r.score, hiring_tier: r.tier, flags: r.flags, drive_minutes: next.drive_minutes ?? r.drive_minutes };
  };

  const saveFields = async (patch: Rec, table: "applicants" | "kit" = "applicants") => {
    if (!a) return;
    setSaving(true);
    let error;
    if (table === "kit") {
      if (!kit) { setSaving(false); return toast.error("No kit record yet — it's created with the sizes form"); }
      ({ error } = await supabase.from("pro_kit").update(patch as never).eq("id", kit.id));
    } else {
      let full = { ...patch };
      if ("score" in patch || "hiring_tier" in patch) full.score_overridden = true;
      else if (Object.keys(patch).some((k) => SCORE_KEYS.has(k))) full = { ...full, ...rescore({ ...a, ...patch }) };
      ({ error } = await supabase.from("applicants").update(full as never).eq("id", a.id));
    }
    setSaving(false);
    if (error) return toast.error("Could not save", { description: error.message });
    toast.success("Saved");
    setEditing(null);
    await load();
    onSaved?.();
  };

  const commit = (f: Field) => {
    let v: any = draft;
    if (f.kind === "number") v = draft === "" ? null : Number(draft);
    if (f.kind === "bool") v = draft === "" ? null : draft === "true";
    if (f.kind === "list") v = String(draft).split(",").map((s) => s.trim()).filter(Boolean);
    if (f.kind === "text" || f.kind === "longtext" || f.kind === "date" || f.kind === "select" || f.kind === "tri") v = draft === "" ? null : draft;
    if (f.key === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast.error("That email doesn't look right");
    if (f.key === "first_name" && !v) return toast.error("First name is required");
    void saveFields({ [f.key]: v }, f.table === "kit" ? "kit" : "applicants");
  };

  const confirmGate = (gate: string) => {
    const col = GATE_COL[gate] ?? gate;
    const conf = { ...(a?.gate_confirmations ?? {}), [gate]: { by: "Justin", on: new Date().toISOString().slice(0, 10) } };
    void saveFields({ [col]: "yes", gate_confirmations: conf });
  };

  if (!a) return <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading record…</div>;

  const renderEditor = (f: Field) => {
    const cls = "h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm";
    if (f.kind === "longtext") return <textarea autoFocus value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} className={`${cls} h-24 py-1`} />;
    if (f.kind === "bool") return <select autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className={cls}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select>;
    if (f.kind === "tri") return <select autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className={cls}><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select>;
    if (f.kind === "select") return <select autoFocus value={draft ?? ""} onChange={(e) => setDraft(e.target.value)} className={cls}><option value="">—</option>{f.options!.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}</select>;
    return <input autoFocus type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"} value={draft ?? ""} onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") commit(f); if (e.key === "Escape") setEditing(null); }} className={cls} />;
  };

  const cell = (f: Field) => {
    const src = f.table === "kit" ? kit : a;
    const val = src?.[f.key];
    const id = `${f.table ?? "a"}.${f.key}`;
    const isEditing = editing === id;
    return (
      <div key={id} className="rounded-lg border border-slate-100 p-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{f.label}
          {f.key === "score" && a.score_overridden && <span className="ml-1 normal-case text-amber-700">· overridden by you</span>}
        </p>
        {isEditing ? (
          <div className="mt-1 space-y-1">
            {renderEditor(f)}
            <div className="flex gap-1">
              <button disabled={saving} onClick={() => commit(f)} className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-900 px-2 text-xs font-bold text-white"><Check className="h-3 w-3" />Save</button>
              <button onClick={() => setEditing(null)} className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs"><X className="h-3 w-3" />Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setEditing(id); setDraft(f.kind === "bool" ? (val === null || val === undefined ? "" : String(val)) : f.kind === "list" ? (val ?? []).join(", ") : f.kind === "tri" ? (val ?? "unknown") : (val ?? "")); }}
            className="group mt-0.5 flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-slate-900">
            <span className="truncate">{show(val)}</span><Pencil className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-600" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-black text-slate-900">Record — click any field to edit</h3>
        <ProSendMenu applicantId={a.id} onSent={load} />
      </div>

      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">Gate answers</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {GATES.map((g) => {
            const col = GATE_COL[g] ?? g;
            const conf = a.gate_confirmations?.[g];
            const f: Field = { key: col, label: GATE_LABEL[g], kind: "tri" };
            return (
              <div key={g} className="flex items-end gap-2">
                <div className="flex-1">{cell(f)}</div>
                {conf && a[col] === "yes" ? (
                  <p className="pb-2 text-[11px] font-semibold text-emerald-700">Yes, confirmed by {conf.by} on {conf.on}</p>
                ) : (
                  <button disabled={saving} onClick={() => confirmGate(g)} className="mb-1 inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 text-xs font-bold text-emerald-800">
                    <PhoneCall className="h-3.5 w-3.5" /> Confirmed on call
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">{g.title}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{g.fields.map(cell)}</div>
        </div>
      ))}
      {a.score_overridden && (
        <button onClick={() => void supabase.from("applicants").update({ score_overridden: false, ...rescore({ ...a, score_overridden: false }) }).eq("id", a.id).then(() => load())}
          className="text-xs font-semibold text-blue-700 underline">Clear score override and recompute</button>
      )}

      <div>
        <p className="mb-2 flex items-center gap-1 text-xs font-black uppercase tracking-wide text-slate-600"><History className="h-3.5 w-3.5" /> Changes</p>
        {audit.length === 0 ? <p className="text-sm text-slate-400">No edits yet.</p> : (
          <ul className="max-h-60 space-y-1 overflow-auto text-xs text-slate-700">
            {audit.map((r) => (
              <li key={r.id} className="rounded bg-slate-50 px-2 py-1">
                <strong>{String(r.field).replace(/_/g, " ")}</strong>: {show(r.old_value)} → {show(r.new_value)} · {new Date(r.changed_at).toLocaleString()} · you
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
