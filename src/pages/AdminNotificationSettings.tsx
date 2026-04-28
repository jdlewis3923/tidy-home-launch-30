/**
 * /admin/settings/notifications — actionable alert routing controls.
 *
 * Channels: PWA push, Google Calendar event, Apple Notes / Google Keep.
 * Per-admin row in notification_preferences. Snooze + quiet hours + per-KPI
 * sensitivity + VIP override are all stored on this single row.
 */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowLeft, BellOff, Bell, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Prefs {
  pwa_push_enabled: boolean;
  calendar_enabled: boolean;
  notes_enabled: boolean;
  quiet_hours_start: number;
  quiet_hours_end: number;
  snoozed_until: string | null;
  per_kpi_sensitivity: Record<string, "off" | "critical" | "warning" | "all">;
  vip_kpi_codes: string[];
}

const DEFAULT_PREFS: Prefs = {
  pwa_push_enabled: true,
  calendar_enabled: true,
  notes_enabled: false,
  quiet_hours_start: 21,
  quiet_hours_end: 7,
  snoozed_until: null,
  per_kpi_sensitivity: {},
  vip_kpi_codes: ["failed_payments", "ai_assistant_uptime", "edge_errors"],
};

export default function AdminNotificationSettings() {
  const [authed, setAuthed] = useState<null | boolean>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [kpis, setKpis] = useState<{ code: string; name: string; category: string }[]>([]);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) { if (active) setAuthed(false); return; }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      if (!active) return;
      if (!isAdmin) { setForbidden(true); setAuthed(true); setLoading(false); return; }
      setAuthed(true); setUserId(user.id);

      const [{ data: prow }, { data: kRows }] = await Promise.all([
        supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("kpi_definitions").select("code, name, category").eq("enabled", true).order("display_order"),
      ]);
      if (!active) return;
      if (prow) {
        setPrefs({
          pwa_push_enabled: prow.pwa_push_enabled,
          calendar_enabled: prow.calendar_enabled,
          notes_enabled: prow.notes_enabled,
          quiet_hours_start: prow.quiet_hours_start,
          quiet_hours_end: prow.quiet_hours_end,
          snoozed_until: prow.snoozed_until,
          per_kpi_sensitivity: (prow.per_kpi_sensitivity ?? {}) as Prefs["per_kpi_sensitivity"],
          vip_kpi_codes: prow.vip_kpi_codes ?? DEFAULT_PREFS.vip_kpi_codes,
        });
      }
      setKpis((kRows ?? []) as typeof kpis);

      // Check push subscription state
      if ("serviceWorker" in navigator && "PushManager" in window) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (active) setPushSubscribed(!!sub);
        } catch { /* noop */ }
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const save = async (next: Partial<Prefs>) => {
    if (!userId) return;
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    setSaving(true);
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: userId,
      ...merged,
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error("Couldn't save: " + error.message);
  };

  const snooze = async (hours: number) => {
    const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    await save({ snoozed_until: until });
    toast.success(`Non-critical alerts paused for ${hours}h`);
  };

  const unsnooze = async () => {
    await save({ snoozed_until: null });
    toast.success("Snooze cleared");
  };

  if (authed === null) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }
  if (authed === false) return <Navigate to="/login?redirect=/admin/settings/notifications" replace />;
  if (forbidden) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><div className="max-w-md text-center"><h1 className="text-2xl font-semibold text-slate-900 mb-2">Admins only</h1></div></div>;
  }

  const isSnoozed = prefs.snoozed_until && new Date(prefs.snoozed_until) > new Date();

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet><title>Alert Settings · Tidy</title><meta name="robots" content="noindex,nofollow" /></Helmet>

      <header className="bg-[#0f172a] text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs uppercase tracking-widest text-[#f5c518] font-semibold">Tidy · Operating System</p>
            <h1 className="text-xl sm:text-3xl font-semibold mt-1">Alert Settings</h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1">Where actionable RED/YELLOW alerts go</p>
          </div>
          <Button asChild variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 px-2.5 text-xs self-start">
            <Link to="/admin/kpis"><ArrowLeft className="h-3.5 w-3.5 mr-1" />KPI Center</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading settings…</div>
        ) : (
          <>
            {/* Snooze banner */}
            {isSnoozed && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
                <BellOff className="h-5 w-5 text-amber-700 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">Non-critical alerts snoozed</p>
                  <p className="text-xs text-amber-800 mt-0.5">Until {new Date(prefs.snoozed_until!).toLocaleString()}. VIP/critical alerts still fire.</p>
                </div>
                <Button size="sm" variant="outline" onClick={unsnooze} className="h-7 text-xs">Wake up</Button>
              </div>
            )}

            {/* Channels */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-3">Channels</h2>
              <div className="space-y-3">
                <ToggleRow
                  label="PWA push notifications"
                  desc={pushSubscribed ? "Installed on this device · ready" : "Install to home screen + grant permission"}
                  checked={prefs.pwa_push_enabled}
                  onChange={(v) => save({ pwa_push_enabled: v })}
                />
                <ToggleRow
                  label="Google Calendar event"
                  desc="Creates a 5-min event with playbook in description"
                  checked={prefs.calendar_enabled}
                  onChange={(v) => save({ calendar_enabled: v })}
                />
                <ToggleRow
                  label="Apple Notes / Google Keep"
                  desc="Append to synced 'Tidy: Action Items' note"
                  checked={prefs.notes_enabled}
                  onChange={(v) => save({ notes_enabled: v })}
                />
              </div>
            </section>

            {/* Quiet hours + snooze */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-3">Quiet hours & snooze</h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <label className="block text-xs">
                  <span className="text-slate-600 font-medium">Start (ET)</span>
                  <input type="number" min={0} max={23} value={prefs.quiet_hours_start}
                    onChange={(e) => save({ quiet_hours_start: parseInt(e.target.value) || 0 })}
                    className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs">
                  <span className="text-slate-600 font-medium">End (ET)</span>
                  <input type="number" min={0} max={23} value={prefs.quiet_hours_end}
                    onChange={(e) => save({ quiet_hours_end: parseInt(e.target.value) || 0 })}
                    className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                </label>
              </div>
              <p className="text-xs text-slate-600 mb-2 font-medium">Snooze non-critical:</p>
              <div className="flex gap-2 flex-wrap">
                {[4, 24, 168].map((h) => (
                  <Button key={h} size="sm" variant="outline" onClick={() => snooze(h)} className="h-8 text-xs">
                    {h === 168 ? "7d" : `${h}h`}
                  </Button>
                ))}
              </div>
            </section>

            {/* VIP overrides */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-1">VIP overrides</h2>
              <p className="text-xs text-slate-500 mb-3">These KPIs always notify, even during quiet hours or snooze.</p>
              <div className="flex flex-wrap gap-1.5">
                {prefs.vip_kpi_codes.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 text-[11px] font-mono bg-rose-50 text-rose-800 border border-rose-200 px-2 py-1 rounded">
                    {c}
                  </span>
                ))}
              </div>
            </section>

            {/* Per-KPI sensitivity */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-3">Per-KPI sensitivity</h2>
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {kpis.map((k) => {
                  const v = prefs.per_kpi_sensitivity[k.code] ?? "all";
                  return (
                    <div key={k.code} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{k.name}</p>
                        <p className="text-[10px] font-mono text-slate-500">{k.code}</p>
                      </div>
                      <select
                        value={v}
                        onChange={(e) => save({
                          per_kpi_sensitivity: { ...prefs.per_kpi_sensitivity, [k.code]: e.target.value as Prefs["per_kpi_sensitivity"][string] },
                        })}
                        className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">All alerts</option>
                        <option value="warning">Warning+</option>
                        <option value="critical">Critical only</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>

            {saving && (
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {checked ? <Bell className="h-4 w-4 text-[#2563eb] mt-0.5 shrink-0" /> : <BellOff className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
