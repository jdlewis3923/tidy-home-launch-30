import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type AgentRow = { key: string; name: string; cadence: string; enabled: boolean; last_run_at: string | null; last_status: string | null; last_summary: string | null };
type RunRow = { id: string; agent_key: string; started_at: string; status: string; is_test: boolean; checked: number; exceptions: number; log: string[] };
type ExcRow = { id: string; agent_key: string; severity: string; title: string; detail: string | null; action_label: string | null; action_url: string | null; is_test: boolean; created_at: string };

const fmt = (iso: string | null, es: boolean) =>
  iso ? new Date(iso).toLocaleString(es ? "es-US" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

const sevClass: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-primary text-primary-foreground",
  normal: "bg-muted text-foreground",
  info: "bg-muted text-muted-foreground",
};

export default function OpsAgentsPanel() {
  const { language } = useLanguage();
  const es = language === "es";
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [runs, setRuns] = useState<Record<string, RunRow>>({});
  const [exc, setExc] = useState<Record<string, ExcRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, r, e] = await Promise.all([
      supabase.from("ops_agents").select("*").order("sort"),
      supabase.from("ops_agent_runs").select("*").order("started_at", { ascending: false }).limit(200),
      supabase.from("ops_agent_exceptions").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(300),
    ]);
    setAgents((a.data ?? []) as AgentRow[]);
    const lr: Record<string, RunRow> = {};
    for (const x of (r.data ?? []) as unknown as RunRow[]) if (!lr[x.agent_key]) lr[x.agent_key] = x;
    setRuns(lr);
    const ex: Record<string, ExcRow[]> = {};
    for (const x of (e.data ?? []) as ExcRow[]) (ex[x.agent_key] ??= []).push(x);
    setExc(ex);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (key: string, enabled: boolean) => {
    setAgents((p) => p.map((x) => (x.key === key ? { ...x, enabled } : x)));
    await supabase.from("ops_agents").update({ enabled, updated_at: new Date().toISOString() }).eq("key", key);
  };
  const resolve = async (id: string) => {
    await supabase.from("ops_agent_exceptions").update({ resolved_at: new Date().toISOString(), resolution: "owner" }).eq("id", id);
    load();
  };
  const runTest = async () => {
    setBusy(true);
    await supabase.functions.invoke("ops-agents", { body: { mode: "test" } });
    setBusy(false);
    load();
  };

  if (loading) return <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{es ? "Agentes de operaciones" : "Ops agents"}</h2>
          <p className="text-sm text-muted-foreground">{es ? "Cada agente maneja lo normal; solo las excepciones van al resumen de 9 AM / 9 PM." : "Each agent handles the normal case; only exceptions go to the 9 AM / 9 PM digest."}</p>
        </div>
        <Button onClick={runTest} disabled={busy} variant="outline">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : es ? "Probar todos con datos de prueba" : "Test all on test data"}</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {agents.map((a) => {
          const run = runs[a.key];
          const list = exc[a.key] ?? [];
          return (
            <article key={a.key} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">{a.name}</h3>
                  <p className="text-xs text-muted-foreground">{a.cadence}</p>
                </div>
                <Switch checked={a.enabled} onCheckedChange={(v) => toggle(a.key, v)} aria-label={`${a.name} on/off`} />
              </div>
              <p className="mt-2 text-sm text-foreground">
                {es ? "Última ejecución" : "Last run"}: {fmt(a.last_run_at, es)}
                {run && <span className="text-muted-foreground"> · {run.is_test ? (es ? "prueba" : "test") : (es ? "real" : "live")} · {run.status}</span>}
              </p>
              {run && run.log?.length > 0 && (
                <ul className="mt-1 text-xs text-muted-foreground list-disc pl-4">
                  {run.log.slice(0, 3).map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              )}
              <div className="mt-3">
                <p className="text-xs font-medium text-foreground mb-1">{es ? "Excepciones abiertas" : "Open exceptions"}: {list.length}</p>
                {list.slice(0, 3).map((x) => (
                  <div key={x.id} className="flex items-start gap-2 py-1.5 border-t border-border">
                    <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${sevClass[x.severity] ?? sevClass.normal}`}>{x.severity}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{x.title}{x.is_test && <span className="text-muted-foreground"> ({es ? "prueba" : "test"})</span>}</p>
                      {x.detail && <p className="text-xs text-muted-foreground break-words">{x.detail}</p>}
                    </div>
                    {x.action_url && <a href={x.action_url} className="text-xs text-primary underline shrink-0">{x.action_label ?? (es ? "Abrir" : "Open")}</a>}
                    <button onClick={() => resolve(x.id)} className="text-xs text-muted-foreground underline shrink-0">{es ? "Listo" : "Done"}</button>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
