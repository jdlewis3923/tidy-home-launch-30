/**
 * Call Queue — the daily hiring driver, built for a phone first.
 *
 * One column per service, ranked. Nothing in here sends a message: Text opens
 * an sms: link on Justin's own phone with the bilingual script prefilled.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, Check, PhoneCall, PauseCircle, XCircle, ShieldCheck,
  Award, RefreshCw, ChevronDown, ChevronRight,
} from "lucide-react";
import { text1, text2, smsLink, inTextingWindow, inCallWindow } from "@/lib/hiring/texts";
import type { QueueState } from "@/lib/hiring/score";
import type { TablesUpdate } from "@/integrations/supabase/types";

type Service = "cleaning" | "lawn" | "car_care" | "ops_coordinator";

const SERVICE_LABEL: Record<Service, string> = {
  cleaning: "Cleaning",
  lawn: "Lawn",
  car_care: "Car Care",
  ops_coordinator: "Ops Coordinator",
};

interface QueueRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  service: string | null;
  queue_state: QueueState;
  score: number | null;
  hiring_tier: string | null;
  flags: string[] | null;
  drive_minutes: number | null;
  why: string | null;
  first_texted_at: string | null;
  followed_up_at: string | null;
  call_at: string | null;
  bg_check_status: string | null;
  coi_general_liability_status: string | null;
}

interface Opening {
  id: string;
  service: string;
  slot_number: number;
  status: string;
}

const OUT_STATES: QueueState[] = ["cold", "hold", "disqualified", "declined"];
const ACTIVE_ORDER: QueueState[] = ["replied", "follow_up_due", "not_contacted"];

function fullName(r: QueueRow): string {
  return `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Unnamed";
}

function tierTone(tier: string | null): string {
  if (tier === "A") return "bg-emerald-100 text-emerald-800";
  if (tier === "B") return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-700";
}

export default function CallQueue() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOut, setShowOut] = useState(false);
  const [callFor, setCallFor] = useState<QueueRow | null>(null);
  const [callWhen, setCallWhen] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: applicants, error: aErr }, { data: openRows }] = await Promise.all([
      supabase
        .from("applicants")
        .select(
          "id, first_name, last_name, phone, service, queue_state, score, hiring_tier, flags, drive_minutes, why, " +
            "first_texted_at, followed_up_at, call_at, bg_check_status, coi_general_liability_status",
        )
        .order("score", { ascending: false }),
      supabase.from("hiring_openings").select("id, service, slot_number, status"),
    ]);
    if (aErr) toast.error(`Could not load the queue: ${aErr.message}`);
    setRows((applicants ?? []) as unknown as QueueRow[]);
    setOpenings((openRows ?? []) as unknown as Opening[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCountByService = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of openings) {
      if (o.status === "posted" || o.status === "interviewing") {
        map[o.service] = (map[o.service] ?? 0) + 1;
      }
    }
    return map;
  }, [openings]);

  const services = useMemo<Service[]>(() => {
    const all: Service[] = ["cleaning", "lawn", "car_care", "ops_coordinator"];
    return all
      .filter((s) => (openCountByService[s] ?? 0) > 0 || rows.some((r) => (r.service ?? "").includes(s)))
      .sort((a, b) => (openCountByService[b] ?? 0) - (openCountByService[a] ?? 0));
  }, [openCountByService, rows]);

  const patch = useCallback(
    async (id: string, values: TablesUpdate<"applicants">, message: string) => {
      setBusy(id);
      const { error } = await supabase.from("applicants").update(values).eq("id", id);
      setBusy(null);
      if (error) { toast.error(error.message); return false; }
      toast.success(message);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...(values as Partial<QueueRow>) } : r)));
      return true;
    },
    [],
  );

  const onText = async (row: QueueRow) => {
    const isFollowUp = row.queue_state === "follow_up_due";
    const body = isFollowUp ? text2(fullName(row)) : text1(fullName(row), row.service);
    await supabase.from("admin_workday_events").insert({
      event_type: "text_prepared", applicant_id: row.id, actor_type: "admin",
      title: `Text prepared — ${fullName(row)}`, detail: isFollowUp ? "Follow-up template" : "First-contact template",
      status: "prepared", action_label: "View applicant", action_url: `/admin/applicants?id=${row.id}`,
      metadata: { template: isFollowUp ? "text_2" : "text_1" },
    });
    window.location.href = smsLink(row.phone, body);
    if (isFollowUp) {
      patch(row.id, { queue_state: "followed_up", followed_up_at: new Date().toISOString() },
        "Moved to followed up");
    }
  };

  const onAdvance = async (row: QueueRow) => {
    setBusy(row.id);
    const { error } = await supabase.functions.invoke("checkr-invite", { body: { applicant_id: row.id } });
    setBusy(null);
    if (error) { toast.error(`Checkr invite failed: ${error.message}`); return; }
    await patch(row.id, { queue_state: "checkr" }, "Background check requested");
  };

  const onHire = async (row: QueueRow) => {
    setBusy(row.id);
    const { data, error } = await supabase.functions.invoke("hiring-mark-hired", {
      body: { applicant_id: row.id },
    });
    setBusy(null);
    if (error) { toast.error(`Could not mark hired: ${error.message}`); return; }
    if (!data?.ok) {
      toast.error(`Blocked: ${(data?.blockers ?? ["unknown reason"]).join(" · ")}`);
      return;
    }
    toast.success("Hired. Indeed pause alert created and the next opening is queued.");
    load();
  };

  const hireBlocker = (row: QueueRow): string | null => {
    const checkr = row.bg_check_status === "clear";
    const coi = row.coi_general_liability_status === "verified";
    if (!checkr && !coi) return "Background check and COI are both still outstanding";
    if (!checkr) return "Background check is not clear yet";
    if (!coi) return "Certificate of insurance is not verified yet";
    return null;
  };

  const textingOpen = inTextingWindow();

  const columnFor = (service: Service) => {
    const mine = rows.filter((r) => (r.service ?? "").includes(service) && r.queue_state !== "hired");
    const open = openCountByService[service] ?? 0;
    const visibleCap = Math.max(6, open * 6);

    const active = ACTIVE_ORDER.flatMap((state) => {
      const group = mine
        .filter((r) => r.queue_state === state)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return state === "not_contacted" ? group.slice(0, visibleCap) : group;
    });
    const out = mine.filter((r) => OUT_STATES.includes(r.queue_state));
    const other = mine.filter(
      (r) => !ACTIVE_ORDER.includes(r.queue_state) && !OUT_STATES.includes(r.queue_state),
    );
    return { active, out, other, open };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Ranked by score. {textingOpen
            ? "Texting window is open."
            : "Texting window is closed — it opens at 9 AM."}
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" /> {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {services.map((service) => {
          const { active, out, other, open } = columnFor(service);
          return (
            <section key={service} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-bold text-slate-900">
                  {SERVICE_LABEL[service]} · {open} open
                </h3>
                <span className="text-xs text-slate-500">{active.length} in queue</span>
              </header>

              <div className="space-y-3 p-3">
                {active.length === 0 && (
                  <p className="px-1 py-4 text-xs text-slate-500">Nobody waiting.</p>
                )}
                {active.map((row, index) => {
                  const blocker = hireBlocker(row);
                  const flags = (row.flags ?? []).slice(0, 2);
                  return (
                    <article key={row.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {index + 1}. {fullName(row)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {row.drive_minutes == null ? "drive unknown" : `${row.drive_minutes} min`}
                            {" · "}
                            <a className="underline" href={`tel:${row.phone ?? ""}`}>{row.phone ?? "no phone"}</a>
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tierTone(row.hiring_tier)}`}>
                          {row.hiring_tier ?? "–"} · {row.score ?? 0}
                        </span>
                      </div>

                      {row.queue_state === "replied" && (
                        <p className="mt-2 text-xs font-bold text-emerald-700">Book the call</p>
                      )}
                      {row.queue_state === "follow_up_due" && (
                        <p className="mt-2 text-xs font-bold text-amber-700">Follow-up due</p>
                      )}
                      {row.why && <p className="mt-2 text-xs text-slate-700">{row.why}</p>}
                      {flags.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {flags.map((f) => (
                            <li key={f} className="text-[11px] text-rose-700">• {f}</li>
                          ))}
                        </ul>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="min-h-11"
                          disabled={!textingOpen || !row.phone || busy === row.id}
                          title={textingOpen ? "Opens your messages app" : "Texting window opens 9 AM"}
                          onClick={() => onText(row)}
                        >
                          <MessageSquare className="mr-1 h-4 w-4" /> Text
                        </Button>
                        <Button
                          size="sm" variant="outline" className="min-h-11" disabled={busy === row.id}
                          onClick={() => patch(row.id, { queue_state: "texted", first_texted_at: row.first_texted_at ?? new Date().toISOString() }, "Marked texted")}
                        >
                          <Check className="mr-1 h-4 w-4" /> Texted
                        </Button>
                        <Button
                          size="sm" variant="outline" className="min-h-11" disabled={busy === row.id}
                          onClick={() => patch(row.id, { queue_state: "replied", replied_at: new Date().toISOString() }, "Marked replied")}
                        >
                          Replied
                        </Button>
                        <Button
                          size="sm" variant="outline" className="min-h-11" disabled={busy === row.id}
                          onClick={() => { setCallFor(row); setCallWhen(""); }}
                        >
                          <PhoneCall className="mr-1 h-4 w-4" /> Call booked
                        </Button>
                        <Button
                          size="sm" variant="outline" className="min-h-11" disabled={busy === row.id}
                          onClick={() => onAdvance(row)}
                          title="Sends the Checkr invitation and moves them to the background-check stage"
                        >
                          <ShieldCheck className="mr-1 h-4 w-4" /> Advance
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="min-h-11" disabled={busy === row.id}
                          onClick={() => patch(row.id, { queue_state: "hold" }, "On hold")}
                        >
                          <PauseCircle className="mr-1 h-4 w-4" /> Hold
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="min-h-11 text-rose-700" disabled={busy === row.id}
                          onClick={() => patch(row.id, { queue_state: "declined" }, "Declined")}
                        >
                          <XCircle className="mr-1 h-4 w-4" /> Decline
                        </Button>
                        <Button
                          size="sm" variant="outline" className="min-h-11 border-emerald-300 text-emerald-800"
                          disabled={!!blocker || busy === row.id}
                          title={blocker ?? "Marks hired and fills the opening"}
                          onClick={() => onHire(row)}
                        >
                          <Award className="mr-1 h-4 w-4" /> Mark hired
                        </Button>
                      </div>
                      {blocker && <p className="mt-2 text-[11px] text-slate-500">Hiring blocked: {blocker}.</p>}
                    </article>
                  );
                })}

                {other.length > 0 && (
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    {other.length} in progress elsewhere (texted, call booked, background check, insurance).
                  </div>
                )}

                {out.length > 0 && (
                  <div className="rounded-xl border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600"
                      onClick={() => setShowOut((v) => !v)}
                    >
                      Out of the queue ({out.length})
                      {showOut ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {showOut && (
                      <ul className="divide-y divide-slate-100">
                        {out.map((r) => (
                          <li key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
                            <span className="truncate">{fullName(r)}</span>
                            <span className="ml-2 shrink-0 text-slate-500">{r.queue_state.replace(/_/g, " ")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {callFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <h4 className="text-sm font-bold text-slate-900">Book a call with {fullName(callFor)}</h4>
            <p className="mt-1 text-xs text-slate-500">
              Weekdays 7:00–8:30 PM or Saturday 9:00–11:00 AM works best.
            </p>
            <input
              type="datetime-local"
              value={callWhen}
              onChange={(e) => setCallWhen(e.target.value)}
              className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
            {callWhen && !inCallWindow(new Date(callWhen)) && (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                That is outside the usual call windows — book it only if you meant to.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" className="flex-1 min-h-11" onClick={() => setCallFor(null)}>Cancel</Button>
              <Button
                className="flex-1 min-h-11"
                disabled={!callWhen}
                onClick={async () => {
                  const ok = await patch(
                    callFor.id,
                    { queue_state: "call_booked", call_at: new Date(callWhen).toISOString() },
                    "Call booked",
                  );
                  if (ok) setCallFor(null);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
