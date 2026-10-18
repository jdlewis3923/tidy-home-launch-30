/**
 * /admin/pipeline/:id — one candidate. Every move is a server function that
 * re-checks the stage's exit requirements; the screen only shows what's missing.
 */
import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ProofPanel from "@/components/admin/pipeline/ProofPanel";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import DeclineDialog, { type DeclineInput } from "@/components/admin/pipeline/DeclineDialog";
import { declineWithUndo, type BoardCard } from "@/pages/AdminPipeline";
import { ARTIFACT_LABEL, PIPELINE_SERVICES, PIPELINE_STAGES, money, nextStage, rpcMessage, serviceLabel, stageIndex, stageLabel } from "@/lib/pipeline";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const db = supabase as any;

type Field = { key: string; label: string; type: "text" | "textarea" | "number" | "bool" | "date" | "datetime" | "select"; options?: string[]; list?: string };
const FIELDS: Record<string, Field[]> = {
  applied: [
    { key: "service", label: "Service", type: "select", options: PIPELINE_SERVICES.map((s) => s.key) },
    { key: "source", label: "Source", type: "select", options: ["indeed", "hanger", "referral", "other"] },
    { key: "phone", label: "Phone", type: "text" }, { key: "email", label: "Email", type: "text" },
    { key: "apply_submitted_at", label: "Application submitted", type: "datetime" },
  ],
  proof: [
    { key: "preferred_language", label: "Preferred language (every message goes in it)", type: "select", options: ["en", "es"] },
    { key: "experience_level", label: "Experience (recorded, not a gate)", type: "select", options: ["none", "informal", "professional"] },
    { key: "drive_time_minutes", label: "Drive time (minutes, 30 max)", type: "number" },
  ],
  screen_booked: [
    { key: "screening_call_completed_at", label: "Phone screen completed", type: "datetime" },
    { key: "call_notes", label: "Call notes (20+ characters)", type: "textarea" },
  ],
  agreement: [{ key: "ica_countersigned_at", label: "ICA countersigned (sends WELCOME-T1)", type: "datetime" }],
  background: [{ key: "checkr_result", label: "Checkr result", type: "select", options: ["clear", "consider", "suspended"] }],
  insured: [
    { key: "coi_effective_date", label: "COI effective", type: "date" },
    { key: "coi_expiry_date", label: "COI expiry", type: "date" },
    { key: "coi_limit_occurrence", label: "COI per-occurrence ($)", type: "number" },
    { key: "coi_limit_aggregate", label: "COI aggregate ($)", type: "number" },
    { key: "coi_names_tidy_as_ai", label: "COI names Tidy as additional insured", type: "bool" },
    { key: "insurance_reimbursement_start_month", label: "Reimbursement start month", type: "date" },
  ],
  active: [
    { key: "kit_issued_at", label: "Kit issued", type: "datetime" },
    { key: "route_confirmed", label: "Route confirmed", type: "bool" },
    { key: "service_days", label: "Service days (comma separated)", type: "text" },
    { key: "reimbursement_m1_paid_at", label: "Reimbursement month 1 paid", type: "datetime" },
    { key: "reimbursement_m2_paid_at", label: "Reimbursement month 2 paid", type: "datetime" },
    { key: "reimbursement_m3_paid_at", label: "Reimbursement month 3 paid", type: "datetime" },
  ],
};
const ARTIFACTS_FOR: Record<string, string[]> = { agreement: ["ica_signed", "w9"], background: ["checkr_report"], insured: ["coi"] };

const toInput = (f: Field, v: any) => {
  if (v == null) return "";
  if (f.type === "datetime") return String(v).slice(0, 16);
  if (f.type === "number" && f.key.includes("limit")) return String(v / 100);
  if (f.key === "service_days") return (v as string[]).join(", ");
  return String(v);
};
const fromInput = (f: Field, s: string): any => {
  if (s === "") return null;
  if (f.type === "bool") return s === "true";
  if (f.type === "number") return f.key.includes("limit") ? Math.round(Number(s) * 100) : Number(s);
  if (f.type === "datetime") return new Date(s).toISOString();
  if (f.key === "service_days") return s.split(",").map((x) => x.trim()).filter(Boolean);
  return s;
};

export default function AdminPipelineRecord() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [equip, setEquip] = useState<Row[]>([]);
  const [claimed, setClaimed] = useState<string[] | null>(null);
  const [presetReason, setPresetReason] = useState<string | undefined>(undefined);
  const [p, setP] = useState<Row | null>(null);
  const [a, setA] = useState<Row | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<Row[]>([]);
  const [spend, setSpend] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [orientationProgress, setOrientationProgress] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "spend" | "hold" | "override" | "withdraw" | "decline">(null);
  const [kitAmount, setKitAmount] = useState("60.00");
  const [holdReason, setHoldReason] = useState(""); const [holdDate, setHoldDate] = useState("");
  const [ovStage, setOvStage] = useState(""); const [ovReason, setOvReason] = useState("");
  const [wdNote, setWdNote] = useState("");

  const load = useCallback(async () => {
    const [pr, ar, ms, art, sp, ev, op] = await Promise.all([
      db.from("contractor_pipeline").select("*").eq("applicant_id", id).maybeSingle(),
      db.from("applicants").select("first_name,last_name,phone,email").eq("id", id).maybeSingle(),
      db.rpc("pipeline_missing", { _id: id }),
      db.from("contractor_artifacts").select("*").eq("applicant_id", id).order("uploaded_at", { ascending: false }),
      db.from("contractor_spend").select("*").eq("applicant_id", id).order("spent_at"),
      db.from("contractor_stage_events").select("*").eq("applicant_id", id).order("created_at", { ascending: false }).limit(50),
      db.from("pro_orientation_progress").select("section_id,started_at,completed_at").eq("applicant_id", id),
    ]);
    if (pr.error) setErr(rpcMessage(pr.error));
    setP(pr.data); setA(ar.data); setMissing(ms.error ? [`Could not check requirements: ${rpcMessage(ms.error)}`] : (ms.data ?? [])); setArtifacts(art.data ?? []); setSpend(sp.data ?? []); setEvents(ev.data ?? []); setOrientationProgress(op.data ?? []);
    setDraft({}); setClaimed(null);
    if (pr.data?.service) { const { data: eq } = await db.from("pipeline_equipment_items").select("*").eq("service", pr.data.service).eq("active", true).order("sort"); setEquip(eq ?? []); }
  }, [id]);
  useEffect(() => {
    const act = search.get("action");
    if (act === "hold" || act === "decline") { setModal(act); if (act === "decline") setPresetReason(search.get("reason") ?? "No equipment"); setSearch({}, { replace: true }); }
  }, [search, setSearch]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const { error } = await db.rpc(fn, { _id: id, ...args });
    if (error) { toast.error(rpcMessage(error)); return false; }
    toast.success(ok); setModal(null); await load(); return true;
  };

  if (!p) return <main className="min-h-screen bg-background p-8 text-sm text-muted-foreground">{err ?? "Loading…"}</main>;
  const name = `${a?.first_name ?? ""} ${a?.last_name ?? ""}`.trim() || "Candidate";
  const merged: Row = { ...p, phone: a?.phone, email: a?.email };
  const nxt = p.stage === "active" ? (p.activated_at ? null : "active") : nextStage(p.stage);
  const needsSpend = nxt === "background" || nxt === "active";
  const canAct = !p.archived && p.state === "open";

  const saveFields = async () => {
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS[p.stage] ?? []) if (f.key in draft) patch[f.key] = fromInput(f, draft[f.key]);
    if (claimed) patch.equipment_claimed = claimed;
    if (!Object.keys(patch).length) return;
    const { error } = await db.rpc("pipeline_update", { _id: id, _patch: patch });
    if (error) toast.error(rpcMessage(error)); else { toast.success("Saved."); await load(); }
  };
  const upload = async (kind: string, file: File) => {
    const path = `${id}/${kind}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("pipeline-artifacts").upload(path, file);
    if (up.error) { toast.error(up.error.message); return; }
    await run("pipeline_add_artifact", { _kind: kind, _path: path, _name: file.name }, `${ARTIFACT_LABEL[kind]} uploaded.`);
  };
  const openArtifact = async (path: string) => {
    const { data, error } = await supabase.storage.from("pipeline-artifacts").createSignedUrl(path, 120);
    if (error) toast.error(error.message); else window.open(data.signedUrl, "_blank", "noopener");
  };
  const advance = (confirm = false) => run("pipeline_advance", {
    _expected_to: nxt, _confirm_spend: confirm, _amount_cents: nxt === "active" ? Math.round(Number(kitAmount) * 100) : null, _note: null,
  }, nxt === "active" && p.stage === "active" ? `${name} is active.` : `${name} moved to ${stageLabel(nxt ?? "")}.`);
  const decline = async (input: DeclineInput) => {
    setModal(null);
    const card = { applicant_id: id, name } as BoardCard;
    try { await declineWithUndo([card], input, () => void load()); navigate("/admin/pipeline"); }
    catch (e) { toast.error(rpcMessage(e as { message?: string })); }
  };
  const total = spend.reduce((s, x) => s + x.amount_cents, 0);
  const today = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>{name} | Pipeline</title></Helmet>
      <div className="mx-auto max-w-4xl space-y-5">
        <Link to="/admin/pipeline" className="text-sm font-semibold text-primary">← Pipeline</Link>
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">{name}</h1>
            <p className="text-sm text-muted-foreground">{serviceLabel(p.service)} · stage {stageIndex(p.stage) + 1} {stageLabel(p.stage)}
              {p.archived ? ` · archived (${p.state})` : p.state !== "open" ? ` · ${p.state}` : ""}</p>
          </div>
          <p className="text-sm font-semibold tabular-nums">Spent {money(total)}</p>
        </header>

        <ol className="grid grid-cols-8 gap-1" aria-label="Stages">
          {PIPELINE_STAGES.map((s, i) => (
            <li key={s.key} className={`rounded px-1 py-1.5 text-center text-[10px] font-semibold ${i < stageIndex(p.stage) ? "bg-primary/20 text-foreground" : i === stageIndex(p.stage) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i + 1}. {s.label}
            </li>
          ))}
        </ol>

        {p.proof_moved_back && <p className="rounded-md border border-accent bg-accent/20 p-3 text-sm font-semibold text-foreground">Moved back for equipment proof.</p>}
        {p.stage === "proof" && !p.proof_link_sent_at && !p.archived && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted p-3 text-sm">
            <span>No proof link has gone out yet.</span>
            <Button size="sm" onClick={() => run("pipeline_send_proof_link", {}, "Proof link sent.")}>Send proof link</Button>
          </div>
        )}
        {p.stage === "background" && <p className="rounded-md border border-border bg-muted p-3 text-sm">Reminder: send the Checkr Essential invite by hand on Checkr's site. Checkr collects its own consent. Tidy sends nothing automatic at this stage.</p>}
        {p.probation_paused_at && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            <span>New assignments paused after 2 probation redos.</span>
            <Button size="sm" onClick={() => run("pipeline_probation_clear", {}, "Assignments resumed.")}>Clear pause</Button>
          </div>
        )}
        {p.activated_at && p.probation_visits_remaining > 0 && <p className="rounded-md border border-border bg-muted p-3 text-sm">Probation: {p.probation_visits_remaining} of 3 visits left (before/after photos required to complete).</p>}
        {p.state === "hold" && <p className="rounded-md border border-border bg-muted p-3 text-sm">On hold: {p.hold_reason} · call back {p.hold_callback_date}</p>}
        {p.state === "lapsed" && <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">Insurance lapsed — no jobs can be assigned. Upload a new COI and update the dates, then reinstate.</p>}
        {p.archived && p.decline_reason && <p className="rounded-md border border-border bg-muted p-3 text-sm">Declined: {p.decline_reason}{p.decline_note ? ` — ${p.decline_note}` : ""}</p>}

        <SimulateReply applicantId={id!} />


        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-base font-bold">What this stage needs</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(FIELDS[p.stage] ?? []).map((f) => {
              const val = f.key in draft ? draft[f.key] : toInput(f, merged[f.key]);
              const set = (v: string) => setDraft((d) => ({ ...d, [f.key]: v }));
              return (
                <div key={f.key} className={`space-y-1 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
                  <Label htmlFor={f.key}>{f.label}</Label>
                  {f.type === "textarea" ? <Textarea id={f.key} value={val} onChange={(e) => set(e.target.value)} rows={3} />
                    : f.type === "select" || f.type === "bool" ? (
                      <select id={f.key} value={val} onChange={(e) => set(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Not answered</option>
                        {(f.type === "bool" ? ["true", "false"] : f.options!).map((o) => <option key={o} value={o}>{f.type === "bool" ? (o === "true" ? "Yes" : "No") : f.key === "service" ? serviceLabel(o) : o}</option>)}
                      </select>
                    ) : <Input id={f.key} list={f.list} value={val} onChange={(e) => set(e.target.value)}
                        type={f.type === "datetime" ? "datetime-local" : f.type === "date" ? "date" : f.type === "number" ? "number" : "text"} />}
                </div>
              );
            })}
            <datalist id="carriers"><option value="Hiscox" /><option value="NEXT" /></datalist>
          </div>
          {p.stage === "proof" && (
            <fieldset className="mt-3 space-y-1 text-sm">
              <legend className="font-semibold">Equipment they say they own (every item must be ticked to advance)</legend>
              {equip.map((it) => {
                const cur = claimed ?? (p.equipment_claimed ?? []);
                return (
                  <label key={it.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={cur.includes(it.id)} onChange={(e) => setClaimed(e.target.checked ? [...cur, it.id] : cur.filter((x: string) => x !== it.id))} />
                    {it.label_en}{it.needs_video ? " (video)" : ""}
                  </label>
                );
              })}
              <p className="text-xs text-muted-foreground">One missing item: Hold with a callback date, or Decline "No equipment".</p>
            </fieldset>
          )}
          {(ARTIFACTS_FOR[p.stage] ?? []).map((k) => (
            <div key={k} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{ARTIFACT_LABEL[k]}:</span>
              {artifacts.some((x) => x.kind === k) ? <span className="text-muted-foreground">uploaded</span> : <span className="text-destructive">missing</span>}
              <input type="file" aria-label={`Upload ${ARTIFACT_LABEL[k]}`} accept=".pdf,image/*" className="text-xs"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(k, f); e.target.value = ""; }} />
            </div>
          ))}
          <div className="mt-4 flex justify-end"><Button variant="outline" onClick={saveFields} disabled={!Object.keys(draft).length && !claimed}>Save</Button></div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          {missing.length > 0 ? (
            <div className="mb-3 text-sm"><p className="font-semibold">Still missing:</p>
              <ul className="list-disc pl-5 text-muted-foreground">{missing.map((m) => <li key={m}>{m}</li>)}</ul></div>
          ) : canAct && nxt && <p className="mb-3 text-sm text-muted-foreground">Everything for this stage is in.</p>}
          <div className="flex flex-wrap gap-2">
            {canAct && nxt && (
              <Button disabled={missing.length > 0} onClick={() => needsSpend ? setModal("spend") : void advance()}>
                {p.stage === "active" ? "Mark active" : `Advance to ${stageLabel(nxt)}`}
              </Button>
            )}
            {canAct && <Button variant="outline" onClick={() => setModal("hold")}>Hold</Button>}
            {p.state === "hold" && !p.archived && <Button onClick={() => run("pipeline_resume", {}, "Back on the board.")}>Resume</Button>}
            {p.state === "lapsed" && !p.archived && <Button onClick={() => run("pipeline_reinstate", {}, "Reinstated.")}>Reinstate</Button>}
            {!p.archived && <Button variant="destructive" onClick={() => setModal("decline")}>Decline</Button>}
            {!p.archived && <Button variant="outline" onClick={() => setModal("withdraw")}>Withdrew</Button>}
            {!p.archived && <Button variant="ghost" onClick={() => setModal("override")}>Override…</Button>}
            {p.archived && <Button onClick={() => run("pipeline_restore", {}, "Restored to the board.")}>Restore</Button>}
          </div>
        </section>

        {(p.stage === "proof" || p.proof_submitted_at) && <ProofPanel id={id} p={p} onChange={() => void load()} />}

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 text-base font-bold">Files</h2>
            {artifacts.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
            <ul className="space-y-1 text-sm">{artifacts.map((x) => (
              <li key={x.id}><button className="text-primary underline" onClick={() => openArtifact(x.storage_path)}>{ARTIFACT_LABEL[x.kind] ?? x.kind}</button>
                <span className="ml-2 text-xs text-muted-foreground">{x.file_name} · {new Date(x.uploaded_at).toLocaleDateString()}</span></li>))}</ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 text-base font-bold">Spend</h2>
            {spend.length === 0 && <p className="text-sm text-muted-foreground">Nothing spent.</p>}
            <ul className="space-y-1 text-sm">{spend.map((x) => <li key={x.id} className="flex justify-between"><span>{x.category === "kit" ? "Kit" : "Background check"}</span><span className="tabular-nums">{money(x.amount_cents)}</span></li>)}</ul>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">Pro orientation</h2><Button asChild size="sm" variant="outline"><Link to="/admin/orientations/preview">Preview / PDF</Link></Button></div>
          <p className="mt-2 text-sm">{orientationProgress.filter((x) => x.completed_at).length} of 4 sections read</p>
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">{["before-you-work","what-it-pays","on-the-job","when-it-matters"].map((key) => { const row = orientationProgress.find((x) => x.section_id === key); return <li key={key}>{row?.completed_at ? "✓" : row?.started_at ? "Started" : "—"} {key.split("-").join(" ")}{row?.completed_at ? ` · ${new Date(row.completed_at).toLocaleString()}` : ""}</li>; })}</ul>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-base font-bold">History</h2>
          <ul className="space-y-1.5 text-sm">{events.map((e) => (
            <li key={e.id} className={e.kind === "override" ? "font-semibold" : ""}>
              <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()} · </span>
              {e.kind}{e.from_stage !== e.to_stage && e.to_stage ? `: ${stageLabel(e.from_stage ?? "")} → ${stageLabel(e.to_stage)}` : ""}
              {e.from_state !== e.to_state && e.to_state ? ` (${e.from_state} → ${e.to_state})` : ""}{e.reason ? ` — ${e.reason}` : ""}
            </li>))}</ul>
        </section>
      </div>

      <Dialog open={modal === "spend"} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{nxt === "background" ? "Spend $64.49 on a background check?" : "Spend money on the Pro kit?"}</DialogTitle>
            <DialogDescription>{nxt === "background" ? `Order the Checkr Essential check for ${name} by hand in Checkr. This records $64.49 against ${serviceLabel(p.service)}.` : `This records the kit cost against ${name}.`}</DialogDescription>
          </DialogHeader>
          {nxt === "active" && <div className="space-y-1"><Label htmlFor="kit-amt">Kit cost ($)</Label><Input id="kit-amt" type="number" step="0.01" value={kitAmount} onChange={(e) => setKitAmount(e.target.value)} /></div>}
          <DialogFooter><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button onClick={() => void advance(true)}>Confirm spend</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "hold"} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Put {name} on hold</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="hold-r">Reason</Label><Textarea id="hold-r" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} rows={2} /></div>
            <div className="space-y-1"><Label htmlFor="hold-d">Call back on (future date)</Label><Input id="hold-d" type="date" min={today} value={holdDate} onChange={(e) => setHoldDate(e.target.value)} /></div>
          </div>
          <DialogFooter><Button disabled={!holdReason.trim() || !holdDate} onClick={() => run("pipeline_hold", { _reason: holdReason.trim(), _callback: holdDate }, "On hold.")}>Hold</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "withdraw"} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{name} withdrew</DialogTitle><DialogDescription>Moves to the archive. You can restore later.</DialogDescription></DialogHeader>
          <Textarea aria-label="Note" placeholder="Note (required)" value={wdNote} onChange={(e) => setWdNote(e.target.value)} rows={2} />
          <DialogFooter><Button disabled={!wdNote.trim()} onClick={async () => { if (await run("pipeline_withdraw", { _note: wdNote.trim() }, "Archived.")) navigate("/admin/pipeline"); }}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "override"} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Override stage</DialogTitle><DialogDescription>Skips the checks. The reason is logged and shown on the dashboard.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <select aria-label="Move to stage" value={ovStage} onChange={(e) => setOvStage(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Move to…</option>
              {PIPELINE_STAGES.filter((s) => s.key !== p.stage).map((s) => <option key={s.key} value={s.key}>{stageIndex(s.key) + 1}. {s.label}</option>)}
            </select>
            <Textarea aria-label="Reason" placeholder="Reason (required)" value={ovReason} onChange={(e) => setOvReason(e.target.value)} rows={2} />
          </div>
          <DialogFooter><Button disabled={!ovStage || ovReason.trim().length < 5} onClick={() => run("pipeline_override", { _to_stage: ovStage, _reason: ovReason.trim() }, "Overridden.")}>Override</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <DeclineDialog open={modal === "decline"} onOpenChange={(v) => setModal(v ? "decline" : null)} names={[name]}
        defaultReason={presetReason} fcraEligible={stageIndex(p.stage) >= stageIndex("background") && artifacts.some((x) => x.kind === "checkr_report")} onConfirm={decline} />
    </main>
  );
}

/** Dry-run only: simulate an inbound candidate text through the real keyword handler. */
function SimulateReply({ applicantId }: { applicantId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (supabase as any).from("app_settings").select("value").eq("key", "sms_dry_run").maybeSingle()
      .then(({ data }: any) => setEnabled(data?.value === "on"));
  }, []);

  if (!enabled) return null;

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("hiring-sms-simulate", {
      body: { applicant_id: applicantId, body: text.trim() },
    });
    setSending(false);
    if (error) toast.error(error.message);
    else if ((data as any)?.handled === false) toast.error("No candidate matched this phone — logged as unmatched.");
    else { toast.success("Simulated reply processed."); setText(""); }
  };

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-2 text-sm font-bold text-amber-900">Simulate reply (dry-run)</h2>
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. YES, C, R, 1, 2, or any message" className="bg-white" />
        <Button size="sm" onClick={send} disabled={sending || !text.trim()}>{sending ? "…" : "Send"}</Button>
      </div>
      <p className="mt-1 text-xs text-amber-800">Runs the exact inbound handler. Keywords: C/CONFIRM, R, 1, 2, YES, STOP/START.</p>
    </section>
  );
}
