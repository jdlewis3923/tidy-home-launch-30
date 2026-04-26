/**
 * /admin/test-zapier — Phase 6 verification helper.
 *
 * Lets the signed-in admin trigger each Zapier event with a stub payload
 * and inspect the response. Same admin gating as setup-stripe-catalog
 * (server-side verified inside the edge function).
 *
 * Remove once all 7 webhook URLs are confirmed wired in Zapier.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type EventName =
  | "welcome_signup"
  | "subscription_confirmed"
  | "visit_scheduled"
  | "visit_on_the_way"
  | "visit_complete"
  | "payment_failed"
  | "password_reset";

interface EventDef {
  name: EventName;
  active: boolean;
  defaultPayload: Record<string, unknown>;
}

const EVENTS: EventDef[] = [
  {
    name: "welcome_signup",
    active: true,
    defaultPayload: { email: "test+welcome@jointidy.co", first_name: "Test" },
  },
  {
    name: "subscription_confirmed",
    active: true,
    defaultPayload: {
      services: ["cleaning"],
      frequency: "biweekly",
      monthly_total_cents: 15900,
      zip: "33156",
    },
  },
  {
    name: "payment_failed",
    active: true,
    defaultPayload: { amount_cents: 15900, attempt_count: 1 },
  },
  {
    name: "visit_scheduled",
    active: false,
    defaultPayload: { service: "cleaning", visit_date: "2025-05-12" },
  },
  {
    name: "visit_on_the_way",
    active: false,
    defaultPayload: { service: "cleaning", eta_minutes: 25 },
  },
  {
    name: "visit_complete",
    active: false,
    defaultPayload: { service: "cleaning", visit_date: "2025-05-12" },
  },
  {
    name: "password_reset",
    active: false,
    defaultPayload: { email: "test+reset@jointidy.co" },
  },
];

interface Result {
  ok: boolean;
  skipped?: string;
  status?: number;
  dispatched?: boolean;
  error?: string;
  details?: unknown;
}

export default function AdminTestZapier() {
  const [running, setRunning] = useState<EventName | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [lang, setLang] = useState<"en" | "es">("en");

  const fire = async (def: EventDef) => {
    setRunning(def.name);
    setResults((r) => ({ ...r, [def.name]: { ok: false } }));

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      setResults((r) => ({
        ...r,
        [def.name]: { ok: false, error: "Sign in as admin first." },
      }));
      setRunning(null);
      return;
    }

    const { data, error } = await supabase.functions.invoke("send-zapier-event", {
      body: {
        event_name: def.name,
        lang,
        user_id: sess.session.user.id,
        payload: def.defaultPayload,
      },
    });

    if (error) {
      setResults((r) => ({ ...r, [def.name]: { ok: false, error: error.message } }));
    } else {
      setResults((r) => ({ ...r, [def.name]: data as Result }));
    }
    setRunning(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-black text-slate-900">Zapier event tester</h1>
        <p className="mt-3 text-sm text-slate-600">
          Fires <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">send-zapier-event</code> with a stub
          payload. Events without a configured <code>ZAP_*_URL</code> secret return{" "}
          <code>skipped: "no_url_configured"</code> — that's expected for events not yet wired.
        </p>

        <div className="mt-6 flex items-center gap-3 text-sm">
          <span className="font-semibold text-slate-700">Lang:</span>
          <button
            type="button"
            onClick={() => setLang("en")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              lang === "en" ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
            }`}
          >
            en
          </button>
          <button
            type="button"
            onClick={() => setLang("es")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              lang === "es" ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
            }`}
          >
            es
          </button>
        </div>

        <div className="mt-8 space-y-4">
          {EVENTS.map((def) => {
            const res = results[def.name];
            return (
              <div
                key={def.name}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-bold text-slate-900">{def.name}</code>
                      {!def.active && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          deferred
                        </span>
                      )}
                    </div>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                      {JSON.stringify(def.defaultPayload, null, 2)}
                    </pre>
                  </div>
                  <button
                    type="button"
                    onClick={() => fire(def)}
                    disabled={running === def.name}
                    className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {running === def.name ? "Firing…" : "Fire"}
                  </button>
                </div>

                {res && (
                  <div
                    className={`mt-3 rounded-lg border p-3 text-xs ${
                      res.ok
                        ? res.skipped
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-rose-200 bg-rose-50 text-rose-800"
                    }`}
                  >
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(res, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
