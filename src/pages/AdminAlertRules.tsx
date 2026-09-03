/**
 * /admin/alert-rules — inline editor for every alert_rule row, so thresholds,
 * windows and cooldowns can be tuned without a code change. The kpi-alerts edge
 * function reads these rows on each run.
 */
import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useHasRoleState } from "@/hooks/useHasRole";
import { toast } from "@/hooks/use-toast";

interface Rule {
  id: string;
  code: string;
  domain: string;
  priority: number | null;
  title: string;
  severity: string;
  digest: string;
  threshold: unknown;
  evaluation_window_days: number | null;
  min_sample: number | null;
  cooldown_hours: number | null;
  enabled: boolean;
  action_text: string | null;
}

const DOMAIN_ORDER = ["capacity", "profit", "funnel", "trust", "plumbing"];

export default function AdminAlertRules() {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<Rule> & { thresholdText?: string }>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("alert_rule")
      .select("id, code, domain, priority, title, severity, digest, threshold, evaluation_window_days, min_sample, cooldown_hours, enabled, action_text")
      .order("domain")
      .order("priority");
    if (error) toast({ title: "Could not load rules", description: error.message, variant: "destructive" });
    setRules((data ?? []) as unknown as Rule[]);
    setDrafts({});
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasRole) void load();
  }, [hasRole, load]);

  const setDraft = (id: string, patch: Partial<Rule> & { thresholdText?: string }) =>
    setDrafts((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const save = async (rule: Rule) => {
    const d = drafts[rule.id] ?? {};
    let threshold = rule.threshold as never;
    if (d.thresholdText !== undefined) {
      try {
        threshold = d.thresholdText.trim() === "" ? null : JSON.parse(d.thresholdText);
      } catch {
        toast({ title: "Threshold must be valid JSON", variant: "destructive" });
        return;
      }
    }
    setSavingId(rule.id);
    const patch = {
      threshold,
      evaluation_window_days: d.evaluation_window_days ?? rule.evaluation_window_days,
      min_sample: d.min_sample ?? rule.min_sample,
      cooldown_hours: d.cooldown_hours ?? rule.cooldown_hours,
      enabled: d.enabled ?? rule.enabled,
    };
    const { error } = await supabase.from("alert_rule").update(patch).eq("id", rule.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, ...patch } as Rule : r)));
    setDrafts((p) => {
      const next = { ...p };
      delete next[rule.id];
      return next;
    });
    toast({ title: `${rule.code} saved` });
  };

  const toggleEnabled = async (rule: Rule, enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
    const { error } = await supabase.from("alert_rule").update({ enabled }).eq("id", rule.id);
    if (error) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !enabled } : r)));
      toast({ title: "Could not toggle rule", description: error.message, variant: "destructive" });
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!hasRole) return <Navigate to="/" replace />;

  const domains = DOMAIN_ORDER.filter((d) => rules.some((r) => r.domain === d)).concat(
    [...new Set(rules.map((r) => r.domain))].filter((d) => !DOMAIN_ORDER.includes(d)),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>Alert Rules · Tidy Admin</title>
        <meta name="description" content="Tune alert thresholds, evaluation windows and cooldowns without a code change." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="bg-[#0f172a] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">Alert Rules</h1>
            <p className="text-xs text-white/60">Edited here, applied on the next rollup run.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 px-2.5 text-xs">
              <Link to="/admin/command">Command</Link>
            </Button>
            <Button size="sm" onClick={load} className="bg-[#f5c518] hover:bg-[#f5c518]/90 text-[#0f172a] font-semibold h-8 px-3 text-xs">
              <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading rules…
          </div>
        ) : (
          domains.map((domain) => (
            <section key={domain} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{domain}</p>
              <div className="mt-3 divide-y divide-slate-100">
                {rules
                  .filter((r) => r.domain === domain)
                  .map((r) => {
                    const d = drafts[r.id] ?? {};
                    const dirty = Object.keys(d).length > 0;
                    return (
                      <div key={r.id} className="py-4">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {r.code} · {r.severity} · {r.digest} digest · priority {r.priority ?? "—"}
                            </p>
                            {r.action_text && <p className="text-xs text-slate-600 mt-1">{r.action_text}</p>}
                          </div>
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <Switch checked={r.enabled} onCheckedChange={(v) => toggleEnabled(r, v)} />
                            {r.enabled ? "Enabled" : "Off"}
                          </label>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <Field label="Threshold (JSON)">
                            <Input
                              className="h-8 text-xs font-mono"
                              value={d.thresholdText ?? (r.threshold ? JSON.stringify(r.threshold) : "")}
                              onChange={(e) => setDraft(r.id, { thresholdText: e.target.value })}
                              placeholder="{}"
                            />
                          </Field>
                          <Field label="Window (days)">
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              value={String(d.evaluation_window_days ?? r.evaluation_window_days ?? 0)}
                              onChange={(e) => setDraft(r.id, { evaluation_window_days: Number(e.target.value) })}
                            />
                          </Field>
                          <Field label="Min sample">
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              value={String(d.min_sample ?? r.min_sample ?? 0)}
                              onChange={(e) => setDraft(r.id, { min_sample: Number(e.target.value) })}
                            />
                          </Field>
                          <Field label="Cooldown (hours)">
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              value={String(d.cooldown_hours ?? r.cooldown_hours ?? 0)}
                              onChange={(e) => setDraft(r.id, { cooldown_hours: Number(e.target.value) })}
                            />
                          </Field>
                        </div>

                        {dirty && (
                          <div className="mt-3 flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-8 px-3 text-xs bg-[#2563eb] hover:bg-[#2563eb]/90"
                              disabled={savingId === r.id}
                              onClick={() => save(r)}
                            >
                              {savingId === r.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-3 text-xs"
                              onClick={() =>
                                setDrafts((p) => {
                                  const next = { ...p };
                                  delete next[r.id];
                                  return next;
                                })
                              }
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      {children}
    </div>
  );
}
