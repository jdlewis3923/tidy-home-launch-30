/**
 * "Add to your next visit" panel — pinned at top of /dashboard when a visit
 * is within 14 days. Suppression rules per spec.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Check, X, Loader2, Sparkles } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ADDON_CATALOG, addonsForServices, type Addon, type AddonService, SERVICE_LABELS } from '@/lib/addon-catalog';
import { formatLongDate } from '@/lib/dashboard-data';

type Visit = { id: string; visit_date: string; service: string; time_window: string | null; jobber_visit_id: string | null };
type AttachRow = { id: string; addon_key: string; status: string; attached_at: string };

interface Props {
  userId: string;
  services: AddonService[];
  nextVisit: Visit | null;
  nextNextVisit: Visit | null;
}

const TIME_WINDOW_FALLBACK = '8:00 – 11:00 AM';

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00').getTime();
  return Math.floor((target - Date.now()) / (24 * 60 * 60 * 1000));
}

function IconFor({ name }: { name: string }) {
  const Cmp = (LucideIcons as any)[name] ?? LucideIcons.Sparkles;
  return <Cmp className="h-4 w-4" />;
}

export default function AddToNextVisitPanel({ userId, services, nextVisit, nextNextVisit }: Props) {
  const { toast } = useToast();
  const [attaches, setAttaches] = useState<AttachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAddon, setPendingAddon] = useState<Addon | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<AddonService | null>(services[0] ?? null);

  useEffect(() => {
    const load = async () => {
      const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('addon_attaches')
        .select('id, addon_key, status, attached_at')
        .eq('user_id', userId)
        .gte('attached_at', since60);
      setAttaches((data as AttachRow[]) ?? []);
      setLoading(false);
    };
    load();
  }, [userId]);

  // Decide which visit to target: if next visit is < 24h out, point at the one after.
  const targetVisit: Visit | null = useMemo(() => {
    if (!nextVisit) return null;
    return daysUntil(nextVisit.visit_date) < 1 ? nextNextVisit : nextVisit;
  }, [nextVisit, nextNextVisit]);

  if (!targetVisit) return null;
  if (daysUntil(targetVisit.visit_date) > 14) return null;

  // Active service tab — default to next visit's service if customer has it.
  const visitService = (targetVisit.service as AddonService);
  const effectiveActive = services.length === 1
    ? services[0]
    : (activeService ?? (services.includes(visitService) ? visitService : services[0]));

  const grouped = addonsForServices(services);
  let visibleAddons = grouped[effectiveActive] ?? [];

  // Push one-time-feel items to bottom if recently bought.
  visibleAddons = [...visibleAddons].sort((a, b) => {
    const aRecent = a.oneTimeFeel && attaches.some(at => at.addon_key === a.key);
    const bRecent = b.oneTimeFeel && attaches.some(at => at.addon_key === b.key);
    return Number(aRecent) - Number(bRecent);
  }).slice(0, 6);

  const pendingForVisit = attaches.filter(a => a.status === 'pending_visit');
  const pendingCount = pendingForVisit.length;
  const isAlreadyAdded = (key: string) => pendingForVisit.some(a => a.addon_key === key);
  const oneTimeRecentDate = (key: string) => {
    const row = attaches.find(a => a.addon_key === key);
    return row ? new Date(row.attached_at).toLocaleDateString() : null;
  };

  const confirm = async () => {
    if (!pendingAddon) return;
    setWorking(pendingAddon.key);
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) { setWorking(null); setPendingAddon(null); return; }

    const { data, error } = await supabase.functions.invoke('attach-addon-to-visit', {
      body: {
        addon_key: pendingAddon.key,
        jobber_visit_id: targetVisit.jobber_visit_id ?? undefined,
        visit_date: targetVisit.visit_date,
      },
    });

    setWorking(null);
    setPendingAddon(null);

    if (error || !data?.ok) {
      toast({
        title: 'Could not add',
        description: data?.stripe_error ?? error?.message ?? 'Try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Added ✓', description: `${pendingAddon.name} on your next invoice.` });
    // Refresh
    setAttaches(prev => [...prev, { id: data.attach_id, addon_key: pendingAddon.key, status: 'pending_visit', attached_at: new Date().toISOString() }]);
  };

  const remove = async (addon: Addon) => {
    const row = pendingForVisit.find(a => a.addon_key === addon.key);
    if (!row) return;
    setWorking(addon.key);
    const { error } = await supabase.functions.invoke('detach-addon-from-visit', { body: { attach_id: row.id } });
    setWorking(null);
    if (error) {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
      return;
    }
    setAttaches(prev => prev.filter(a => a.id !== row.id));
    toast({ title: 'Removed' });
  };

  return (
    <section id="add-to-next-visit" className="relative mx-auto mt-6 max-w-[1280px] px-6">
      <div className="rounded-3xl border border-[hsl(var(--hairline))] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
            Add to your next visit
          </h2>
          <p className="text-sm text-ink-soft">
            {SERVICE_LABELS[visitService] ?? 'Visit'} · {formatLongDate(targetVisit.visit_date)} · {targetVisit.time_window || TIME_WINDOW_FALLBACK}
          </p>
        </div>

        {pendingCount >= 3 ? (
          <div className="mt-4 rounded-xl bg-cream/40 p-4 text-sm text-ink-soft">
            You're set for {formatLongDate(targetVisit.visit_date)}. {pendingCount} add-ons attached.
          </div>
        ) : (
          <>
            {services.length > 1 && (
              <div className="mt-4 flex gap-2">
                {services.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setActiveService(s)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      effectiveActive === s
                        ? 'bg-ink text-white'
                        : 'bg-cream text-ink-soft hover:bg-cream-deep/40'
                    }`}
                  >
                    {SERVICE_LABELS[s]}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="mt-6 flex items-center gap-2 text-ink-soft">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleAddons.map(addon => {
                  const added = isAlreadyAdded(addon.key);
                  const recentOneTime = addon.oneTimeFeel ? oneTimeRecentDate(addon.key) : null;
                  return (
                    <div
                      key={addon.key}
                      className={`rounded-2xl border p-4 transition ${
                        added
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                          : 'border-[hsl(var(--hairline))] bg-white hover:border-[hsl(var(--primary))]/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[hsl(var(--primary))]">
                            <IconFor name={addon.icon} />
                            <span className="text-sm font-semibold text-ink">{addon.name}</span>
                          </div>
                          <div className="mt-1 text-sm text-ink-soft">${addon.price}</div>
                          {recentOneTime && (
                            <div className="mt-1 text-[11px] text-ink-faint">Last done {recentOneTime}</div>
                          )}
                        </div>
                        {added ? (
                          <button
                            type="button"
                            disabled={working === addon.key}
                            onClick={() => remove(addon)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--hairline))] px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
                          >
                            {working === addon.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                            Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={working === addon.key}
                            onClick={() => setPendingAddon(addon)}
                            className="inline-flex items-center gap-1 rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white hover:bg-ink-soft disabled:opacity-60"
                          >
                            <Plus className="h-3 w-3" /> Add
                          </button>
                        )}
                      </div>
                      {added && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                          <Check className="h-3 w-3" /> Added
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-[11px] text-ink-faint">
              Charged on your next invoice · cancel anytime before visit
            </p>
          </>
        )}
      </div>

      {/* Confirm modal */}
      {pendingAddon && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
          <div className="max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-ink">
              Add {pendingAddon.name} to your {formatLongDate(targetVisit.visit_date)} visit?
            </h3>
            <p className="mt-2 text-sm text-ink-soft">
              ${pendingAddon.price} will be added to your next invoice. You can remove it any time before the visit.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAddon(null)}
                disabled={!!working}
                className="rounded-lg border border-[hsl(var(--hairline))] px-4 py-2 text-sm font-medium text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!!working}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-60"
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
