/**
 * /admin/pipeline — the contractor board. Seven columns in fixed order plus a
 * Hold area. Cards are not draggable and there is no stage picker: the only way
 * to move someone is the Advance button on their record (server-checked).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HireSpecsBanner } from "@/components/admin/RescheduleBanner";
import DeclineDialog, { type DeclineInput } from "@/components/admin/pipeline/DeclineDialog";
import { PIPELINE_SERVICES, PIPELINE_STAGES, rpcMessage, serviceLabel, stageIndex } from "@/lib/pipeline";

export type BoardCard = {
  applicant_id: string; name: string; city: string | null; service: string | null; stage: string; state: string;
  days_in_stage: number; hold_callback_date: string | null; hold_reason: string | null; callback_overdue: boolean;
  activated: boolean; previously_declined: string | null; overridden: boolean;
};

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export async function declineWithUndo(cards: BoardCard[], input: DeclineInput, onRestored: () => void) {
  const ids = cards.map((c) => c.applicant_id);
  const { error } = ids.length > 1
    ? await supabase.rpc("pipeline_bulk_decline", { _ids: ids, _reason: input.reason, _note: input.note || null })
    : await supabase.rpc("pipeline_decline", {
        _id: ids[0], _reason: input.reason, _note: input.note || null,
        _pre_adverse: input.preAdverse ?? null, _rights_provided: input.rightsProvided ?? null, _adverse: input.adverse ?? null,
      });
  if (error) throw error;
  const label = cards.length === 1 ? `${cards[0].name || "Candidate"} declined.` : `${cards.length} candidates declined.`;
  toast(label, {
    duration: 10_000,
    action: {
      label: "Undo",
      onClick: async () => {
        for (const id of ids) {
          const { error: e } = await supabase.rpc("pipeline_restore", { _id: id });
          if (e) { toast.error(rpcMessage(e)); return; }
        }
        toast.success(cards.length === 1 ? `${cards[0].name} restored.` : "Restored.");
        onRestored();
      },
    },
  });
}

export default function AdminPipeline() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const service = params.get("service") ?? "all";
  const fromSpend = params.get("from") === "background";
  const view = params.get("view") === "callbacks" ? "callbacks" : "board";
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ stage: string; ids: Set<string> }>({ stage: "", ids: new Set() });
  const [declineOpen, setDeclineOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("pipeline_board");
    if (error) setErr(rpcMessage(error)); else { setErr(null); setCards((data ?? []) as BoardCard[]); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => cards.filter((c) =>
    (service === "all" || c.service === service) && (!fromSpend || stageIndex(c.stage) >= 4)), [cards, service, fromSpend]);
  const open = visible.filter((c) => c.state !== "hold");
  const held = visible.filter((c) => c.state === "hold")
    .sort((a, b) => (a.hold_callback_date ?? "").localeCompare(b.hold_callback_date ?? ""));
  const callbacks = [...held].sort((a, b) => Number(b.callback_overdue) - Number(a.callback_overdue)
    || (a.hold_callback_date ?? "").localeCompare(b.hold_callback_date ?? ""));

  const toggle = (c: BoardCard) => setSelected((s) => {
    const ids = new Set(s.stage === c.stage ? s.ids : []);
    if (ids.has(c.applicant_id)) ids.delete(c.applicant_id); else ids.add(c.applicant_id);
    return { stage: c.stage, ids };
  });
  const selectedCards = cards.filter((c) => selected.ids.has(c.applicant_id));

  const confirmDecline = async (input: DeclineInput) => {
    const removing = selectedCards;
    const ids = new Set(removing.map((c) => c.applicant_id));
    setCards((cs) => cs.filter((c) => !ids.has(c.applicant_id))); // gone at once
    setSelected({ stage: "", ids: new Set() });
    setDeclineOpen(false);
    try { await declineWithUndo(removing, input, () => void load()); }
    catch (e) { toast.error(rpcMessage(e as { message?: string })); void load(); }
  };

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Pipeline | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-[1600px] space-y-5">
        <HireSpecsBanner />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Contractor pipeline</h1>
            <p className="mt-1 text-sm text-muted-foreground">One stage at a time. Open a card to advance it.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border bg-card p-0.5" role="tablist" aria-label="View">
              {(["board", "callbacks"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setParam("view", v === "board" ? null : v)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {v === "board" ? "Board" : `Callbacks (${held.length})`}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-border bg-card p-0.5" role="group" aria-label="Service filter">
              {[{ key: "all", label: "All" }, ...PIPELINE_SERVICES].map((s) => (
                <button key={s.key} aria-pressed={service === s.key} onClick={() => setParam("service", s.key === "all" ? null : s.key)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold ${service === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {fromSpend && (
          <p className="text-sm text-muted-foreground">Showing stage 5 and later. <button className="font-semibold text-primary underline" onClick={() => setParam("from", null)}>Show all stages</button></p>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {view === "callbacks" ? (
          <section className="rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-4 py-3 text-base font-bold">Callbacks</h2>
            {callbacks.length === 0 && <p className="px-4 py-4 text-sm text-muted-foreground">Nobody is on hold.</p>}
            <ul className="divide-y divide-border">
              {callbacks.map((c) => (
                <li key={c.applicant_id}>
                  <Link to={`/admin/pipeline/${c.applicant_id}`} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50 ${c.callback_overdue ? "bg-destructive/10" : ""}`}>
                    <span>
                      <span className={`font-semibold ${c.callback_overdue ? "text-destructive" : "text-foreground"}`}>{c.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{serviceLabel(c.service)} · stage {stageIndex(c.stage) + 1}</span>
                      <span className="block text-xs text-muted-foreground">{c.hold_reason}</span>
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${c.callback_overdue ? "text-destructive" : "text-foreground"}`}>
                      {c.callback_overdue ? "Overdue · " : "Call back "}{c.hold_callback_date ? fmtDate(c.hold_callback_date) : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <>
            {selected.ids.size > 0 && (
              <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 shadow-sm">
                <span className="text-sm font-semibold">{selected.ids.size} selected in {PIPELINE_STAGES[stageIndex(selected.stage)]?.label}</span>
                <span className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelected({ stage: "", ids: new Set() })}>Clear</Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeclineOpen(true)}>Decline selected</Button>
                </span>
              </div>
            )}
            <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: "repeat(7, minmax(180px, 1fr))" }}>
              {PIPELINE_STAGES.map((st, i) => {
                const col = open.filter((c) => c.stage === st.key);
                return (
                  <section key={st.key} className="flex min-h-40 flex-col rounded-lg border border-border bg-muted/40" aria-label={`Stage ${i + 1} ${st.label}`}>
                    <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
                      <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">{i + 1} · {st.label}</h2>
                      <span className="text-sm font-bold tabular-nums">{col.length}</span>
                    </header>
                    {st.cost > 0 && <p className="px-3 pt-1 text-[11px] text-muted-foreground">Spend gate</p>}
                    <div className="flex flex-col gap-2 p-2">
                      {col.map((c) => (
                        <article key={c.applicant_id} draggable={false}
                          className="relative cursor-pointer rounded-md border border-border bg-card p-2.5 shadow-sm hover:border-primary"
                          onClick={() => navigate(`/admin/pipeline/${c.applicant_id}`)}>
                          <div className="flex items-start gap-2">
                            <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                              <Checkbox aria-label={`Select ${c.name}`} checked={selected.ids.has(c.applicant_id)} onCheckedChange={() => toggle(c)} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">{c.name || "Unnamed"}</p>
                              <p className="truncate text-xs text-muted-foreground">{c.city ?? "—"} · {c.days_in_stage}d in stage</p>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">{serviceLabel(c.service)}</span>
                                {c.state === "lapsed" && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">Insurance lapsed</span>}
                                {c.stage === "active" && !c.activated && c.state === "open" && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Not yet active</span>}
                                {c.overridden && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">Overridden</span>}
                              </div>
                              {c.previously_declined && (
                                <p className="mt-1.5 rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground">{c.previously_declined}</p>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            <section className="rounded-lg border border-border bg-card" aria-label="Hold">
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold uppercase tracking-wide">Hold ({held.length})</h2>
              {held.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Nobody is on hold.</p>}
              <div className="flex flex-wrap gap-2 p-3">
                {held.map((c) => (
                  <Link key={c.applicant_id} to={`/admin/pipeline/${c.applicant_id}`}
                    className="relative rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-primary">
                    {c.callback_overdue && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-destructive" aria-label="Callback overdue" />}
                    <span className="font-semibold">{c.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">stage {stageIndex(c.stage) + 1} · call {c.hold_callback_date ? fmtDate(c.hold_callback_date) : "—"}</span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
      <DeclineDialog open={declineOpen} onOpenChange={setDeclineOpen} names={selectedCards.map((c) => c.name)}
        fcraEligible={stageIndex(selected.stage) >= 4} onConfirm={confirmDecline} />
    </main>
  );
}
