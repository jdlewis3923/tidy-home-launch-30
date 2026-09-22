/**
 * Add from Indeed + Import CSV.
 *
 * Both paths run the same pure scoring function before insert, and dedupe on
 * phone digits, so an applicant pasted twice updates one row instead of
 * creating a second.
 */
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Sparkles, X } from "lucide-react";
import { scoreApplicant, type Tri } from "@/lib/hiring/score";
import type { TablesInsert } from "@/integrations/supabase/types";

const CSV_HEADERS = [
  "name", "phone", "service", "source", "applied_on", "city_or_zip", "years_in_service",
  "owner_operator", "has_insurance", "trade_job_current", "experience_matches_resume",
  "bilingual", "drivers_license", "work_authorized", "own_equipment", "background_check_ok",
  "reads_texts", "tier_hint", "why", "watch_for", "status", "last_contacted", "notes",
] as const;

const STATUS_TO_QUEUE: Record<string, string> = {
  "": "not_contacted",
  new: "not_contacted",
  texted: "texted",
  follow_up_due: "follow_up_due",
  followed_up: "followed_up",
  replied: "replied",
  call_booked: "call_booked",
  interviewed: "interviewed",
  hold: "hold",
  declined: "declined",
  cold: "cold",
  disqualified: "disqualified",
  checkr: "checkr",
  insurance: "insurance",
  hired: "hired",
};

export interface DraftApplicant {
  name: string;
  email?: string | null;
  phone: string | null;
  service: string | null;
  source: string | null;
  applied_on: string | null;
  city_or_zip: string | null;
  years_in_service: number | null;
  owner_operator: boolean | null;
  has_insurance: boolean | null;
  trade_job_current: boolean | null;
  experience_matches_resume: Tri;
  bilingual: Tri;
  drivers_license: Tri;
  work_authorized: Tri;
  own_equipment: Tri;
  background_check_ok: Tri;
  reads_texts: Tri;
  tier_hint: string | null;
  why: string | null;
  watch_for: string | null;
  notes: string | null;
  queue_state?: string;
  first_texted_at?: string | null;
  is_test_row?: boolean;
}

const EMPTY: DraftApplicant = {
  name: "", email: null, phone: null, service: null, source: "indeed", applied_on: null, city_or_zip: null,
  years_in_service: null, owner_operator: null, has_insurance: null, trade_job_current: null,
  experience_matches_resume: "unknown", bilingual: "unknown", drivers_license: "unknown",
  work_authorized: "unknown", own_equipment: "unknown", background_check_ok: "unknown",
  reads_texts: "unknown", tier_hint: null, why: null, watch_for: null, notes: null,
};

function tri(raw: string | null | undefined): Tri {
  const v = (raw ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(v)) return "yes";
  if (["no", "n", "false", "0"].includes(v)) return "no";
  return "unknown";
}

function bool(raw: string | null | undefined): boolean | null {
  const v = tri(raw);
  return v === "unknown" ? null : v === "yes";
}

function digits(phone: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Score + insert (or update on a phone match). Returns the row id. */
export async function saveDraft(draft: DraftApplicant): Promise<string> {
  const scored = scoreApplicant({
    service: draft.service,
    city_or_zip: draft.city_or_zip,
    applied_on: draft.applied_on,
    years_in_service: draft.years_in_service,
    owner_operator: draft.owner_operator,
    has_insurance: draft.has_insurance,
    trade_job_current: draft.trade_job_current,
    experience_matches_resume: draft.experience_matches_resume,
    tier_hint: draft.tier_hint,
    notes: draft.notes,
    bilingual: draft.bilingual,
    drivers_license: draft.drivers_license,
    work_authorized: draft.work_authorized,
    own_equipment: draft.own_equipment,
    background_check_ok: draft.background_check_ok,
    reads_texts: draft.reads_texts,
    queue_state: draft.queue_state ?? "not_contacted",
  });

  const [first, ...rest] = draft.name.trim().split(/\s+/);
  const payload: TablesInsert<"applicants"> = {
    email: draft.email?.trim() || "",
    first_name: first ?? null,
    last_name: rest.join(" ") || null,
    phone: draft.phone,
    service: draft.service,
    source: draft.source,
    applied_on: draft.applied_on,
    city_or_zip: draft.city_or_zip,
    zip: /^\d{5}$/.test(draft.city_or_zip ?? "") ? draft.city_or_zip : undefined,
    years_in_service: draft.years_in_service,
    owner_operator: draft.owner_operator,
    has_insurance: draft.has_insurance,
    trade_job_current: draft.trade_job_current,
    experience_matches_resume: draft.experience_matches_resume,
    bilingual_gate: draft.bilingual,
    drivers_license: draft.drivers_license,
    work_authorized: draft.work_authorized,
    own_equipment: draft.own_equipment,
    background_check_ok: draft.background_check_ok,
    reads_texts: draft.reads_texts,
    tier_hint: draft.tier_hint,
    why: draft.why,
    watch_for: draft.watch_for,
    notes: draft.notes,
    first_texted_at: draft.first_texted_at ?? null,
    is_test_row: draft.is_test_row ?? false,
    score: scored.score,
    hiring_tier: scored.tier,
    flags: scored.flags,
    drive_minutes: scored.drive_minutes,
    queue_state: scored.queue_state,
  };

  const phoneDigits = digits(draft.phone);
  if (phoneDigits.length >= 10) {
    const { data: existing } = await supabase
      .from("applicants")
      .select("id, phone")
      .not("phone", "is", null);
    const match = (existing ?? []).find((r) => digits(r.phone) === phoneDigits);
    if (match) {
      const { error } = await supabase.from("applicants").update(payload).eq("id", match.id);
      if (error) throw new Error(error.message);
      return match.id;
    }
  }

  const { data, error } = await supabase.from("applicants").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Minimal RFC-ish CSV row splitter (handles quoted commas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): DraftApplicant[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("The file has no data rows.");
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const missing = CSV_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const get = (name: string) => cells[header.indexOf(name)] ?? "";
    const years = get("years_in_service");
    const lastContacted = get("last_contacted");
    return {
      ...EMPTY,
      name: get("name"),
      phone: get("phone") || null,
      service: get("service") || null,
      source: get("source") || null,
      applied_on: get("applied_on") || null,
      city_or_zip: get("city_or_zip") || null,
      years_in_service: years ? Number(years) : null,
      owner_operator: bool(get("owner_operator")),
      has_insurance: bool(get("has_insurance")),
      trade_job_current: bool(get("trade_job_current")),
      experience_matches_resume: tri(get("experience_matches_resume")),
      bilingual: tri(get("bilingual")),
      drivers_license: tri(get("drivers_license")),
      work_authorized: tri(get("work_authorized")),
      own_equipment: tri(get("own_equipment")),
      background_check_ok: tri(get("background_check_ok")),
      reads_texts: tri(get("reads_texts")),
      tier_hint: get("tier_hint").toUpperCase() || null,
      why: get("why") || null,
      watch_for: get("watch_for") || null,
      notes: get("notes") || null,
      queue_state: STATUS_TO_QUEUE[get("status").toLowerCase()] ?? "not_contacted",
      first_texted_at: lastContacted ? new Date(lastContacted).toISOString() : null,
    };
  });
}

export default function AddApplicants({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<null | "indeed" | "csv">(null);
  const [paste, setPaste] = useState("");
  const [service, setService] = useState("cleaning");
  const [draft, setDraft] = useState<DraftApplicant | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const extract = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("hiring-extract-indeed", {
      body: { text: paste, service },
    });
    setBusy(false);
    if (error) { toast.error(`Could not read that paste: ${error.message}`); return; }
    if (!data?.ok) { toast.error(data?.error ?? "Extraction failed"); return; }
    const f = data.fields as Record<string, unknown>;
    setDraft({
      ...EMPTY,
      ...f,
      name: String(f.name ?? ""),
      service: (f.service as string) ?? service,
      bilingual: tri(f.bilingual as string),
      drivers_license: tri(f.drivers_license as string),
      work_authorized: tri(f.work_authorized as string),
      own_equipment: tri(f.own_equipment as string),
      background_check_ok: tri(f.background_check_ok as string),
      reads_texts: tri(f.reads_texts as string),
      experience_matches_resume: tri(f.experience_matches_resume as string),
    } as DraftApplicant);
  }, [paste, service]);

  const onCsv = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const drafts = parseCsv(await file.text());
      let saved = 0;
      for (const d of drafts) { await saveDraft(d); saved += 1; }
      toast.success(`Imported and scored ${saved} applicant${saved === 1 ? "" : "s"}`);
      setMode(null);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }, [onDone]);

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setMode("indeed")}>
          <Sparkles className="mr-1 h-4 w-4" /> Add from Indeed
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1 h-4 w-4" /> Import CSV
        </Button>
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ""; }}
        />
      </div>

      {mode === "indeed" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">Add from Indeed</h4>
              <button type="button" onClick={() => { setMode(null); setDraft(null); setPaste(""); }}>
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            {!draft ? (
              <>
                <label className="mt-3 block text-xs font-semibold text-slate-700" htmlFor="indeed-service">
                  Opening
                </label>
                <select
                  id="indeed-service" value={service} onChange={(e) => setService(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                >
                  <option value="cleaning">Cleaning</option>
                  <option value="lawn">Lawn</option>
                  <option value="car_care">Car Care</option>
                  <option value="ops_coordinator">Ops Coordinator</option>
                </select>

                <label className="mt-3 block text-xs font-semibold text-slate-700" htmlFor="indeed-paste">
                  Paste the candidate's Indeed page
                </label>
                <textarea
                  id="indeed-paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={10}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
                  placeholder="Select the whole candidate page on Indeed, copy, and paste it here."
                />
                <Button className="mt-3 w-full min-h-11" disabled={busy || paste.trim().length < 20} onClick={extract}>
                  {busy ? "Reading…" : "Read the page"}
                </Button>
              </>
            ) : (
              <>
                <p className="mt-2 text-xs text-slate-500">Check these, then save.</p>
                <div className="mt-3 space-y-2">
                  {([
                    ["name", "Name"], ["phone", "Phone"], ["city_or_zip", "City or ZIP"],
                    ["applied_on", "Applied on"], ["years_in_service", "Years in this trade"],
                    ["why", "Why call them"], ["watch_for", "Watch for"], ["notes", "Notes"],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-[11px] font-semibold text-slate-600" htmlFor={`f-${key}`}>{label}</label>
                      <input
                        id={`f-${key}`}
                        value={String((draft as unknown as Record<string, unknown>)[key] ?? "")}
                        onChange={(e) => setDraft({ ...draft, [key]: e.target.value } as DraftApplicant)}
                        className="mt-0.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                      />
                    </div>
                  ))}
                  {([
                    ["bilingual", "Bilingual"], ["drivers_license", "Driver's licence"],
                    ["work_authorized", "Work authorized"], ["own_equipment", "Own equipment"],
                    ["background_check_ok", "Background check"], ["reads_texts", "Reads texts"],
                    ["experience_matches_resume", "Experience matches résumé"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-slate-600" htmlFor={`g-${key}`}>{label}</label>
                      <select
                        id={`g-${key}`} value={draft[key] as string}
                        onChange={(e) => setDraft({ ...draft, [key]: e.target.value as Tri })}
                        className="min-h-11 rounded-lg border border-slate-300 px-2 text-sm"
                      >
                        <option value="yes">yes</option>
                        <option value="no">no</option>
                        <option value="unknown">unknown</option>
                      </select>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="ghost" className="flex-1 min-h-11" onClick={() => setDraft(null)}>Back</Button>
                  <Button
                    className="flex-1 min-h-11" disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await saveDraft({ ...draft, years_in_service: draft.years_in_service == null ? null : Number(draft.years_in_service) });
                        toast.success("Saved and scored");
                        setMode(null); setDraft(null); setPaste("");
                        onDone();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Save failed");
                      } finally { setBusy(false); }
                    }}
                  >
                    Save and score
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
