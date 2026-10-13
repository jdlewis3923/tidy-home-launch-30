/** /admin/alerts — every alert rule, its tier, and a logged way to change it. */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Rule = { rule_key: string; label: string; tier: "urgent" | "digest" | "dashboard"; night_ok: boolean; updated_at: string };
type Log = { id: string; rule_key: string; old_tier: string | null; new_tier: string | null; changed_at: string };
const TIERS = [["urgent", "Urgent — text + email now"], ["digest", "Digest — 9 AM / 9 PM"], ["dashboard", "Dashboard only"]] as const;

export default function AlertTiers() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [r, l] = await Promise.all([
      supabase.from("admin_alert_tiers" as never).select("*").order("tier").order("label"),
      supabase.from("admin_alert_tier_log" as never).select("*").order("changed_at", { ascending: false }).limit(20),
    ]);
    setRules((r.data ?? []) as unknown as Rule[]);
    setLog((l.data ?? []) as unknown as Log[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = async (rule: Rule, tier: string, night_ok?: boolean) => {
    setBusy(rule.rule_key);
    const { error } = await supabase.rpc("admin_set_alert_tier" as never, { _rule: rule.rule_key, _tier: tier, _night_ok: night_ok ?? null } as never);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Tier changed and logged");
    void load();
  };
  const test = async (mode: "test_urgent" | "test_digest", edition?: string) => {
    const { data, error } = await supabase.functions.invoke("admin-alert-dispatch", { body: { mode, edition } });
    if (error || !data?.ok) { toast.error(error?.message ?? data?.error ?? "Test failed"); return; }
    toast.success(mode === "test_urgent" ? "Test urgent alert sent — check your phone and email" : `Digest sent: email ${data.email}, text ${data.sms}`);
  };

  return (
    <section id="tiers" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Alert tiers ({rules.length})</h2>
          <p className="text-xs text-slate-500">Urgent texts and emails you 9 AM–9 PM; only rules marked "may wake me" reach you at night. Everything else waits for the 9 AM "Today" and 9 PM "Tonight" digests.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void test("test_urgent")}>Send test urgent</Button>
          <Button size="sm" variant="outline" onClick={() => void test("test_digest", "today")}>Send test 9 AM digest</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-2">Alert</th><th className="p-2">Tier</th><th className="p-2">May wake me (9 PM–9 AM)</th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.rule_key} className="border-t border-slate-100">
                <td className="p-2 text-slate-900">{r.label}<div className="text-[10px] text-slate-400">{r.rule_key}</div></td>
                <td className="p-2">
                  <select value={r.tier} disabled={busy === r.rule_key} onChange={(e) => void set(r, e.target.value)} className="rounded border border-slate-300 bg-white p-1">
                    {TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <input type="checkbox" checked={r.night_ok} disabled={r.tier !== "urgent" || busy === r.rule_key} onChange={(e) => void set(r, r.tier, e.target.checked)} aria-label={`${r.label} may wake me`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {log.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-900">Tier changes</h3>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {log.map((l) => <li key={l.id}>{new Date(l.changed_at).toLocaleString()} · {l.rule_key}: {l.old_tier} → {l.new_tier}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
