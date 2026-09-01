/**
 * Tidy — /dashboard/services
 *
 * The redemption surface for the bundle gift plus the self-serve upsell:
 *
 *  1. "Your free add-on this month" — one free premium add-on per month when
 *     the plan carries two or more services (subscriptions.free_addons_per_month).
 *     Redeeming calls attach-addon-to-visit with redeem_free: true, which skips
 *     Stripe entirely. The gift is never a percentage discount.
 *  2. Paid add-ons for the next visit — same function, charged on the next invoice.
 *  3. Add a service — routes through stripe-create-checkout exactly like the
 *     initial plan builder does.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { ArrowRight, Check, Gift, Loader2, Plus, Sparkles, X } from 'lucide-react';
import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import RouteFallback from '@/components/RouteFallback';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDashboardData, formatLongDate, serviceLabel } from '@/lib/dashboard-data';
import { useLanguage } from '@/contexts/LanguageContext';
import { startAddServiceCheckout, type CheckoutServiceLine } from '@/lib/checkout';
import {
  SERVICE_NAMES,
  SIZE_LABELS,
  SIZE_HELPERS,
  SIZE_PRICES,
  SIZES,
  SERVICE_UNIT,
  type CanonService,
  type CanonSize,
} from '@/lib/pricing-canon';
import type { Frequency } from '@/lib/dashboard-pricing';

type CatalogRow = {
  addon_key: string;
  display_name: string;
  price_cents: number;
  services: string[];
  lucide_icon: string | null;
  sort_order: number;
  is_specialist: boolean;
};

type AttachRow = {
  id: string;
  addon_key: string;
  addon_name: string;
  status: string;
  attached_at: string;
  is_free: boolean;
  free_period: string | null;
};

const SERVICE_DB_KEY: Record<CanonService, string> = {
  cleaning: 'cleaning',
  lawn: 'lawn',
  detailing: 'detail',
};

const FREQUENCIES: Frequency[] = ['monthly', 'biweekly', 'weekly'];
const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: 'Monthly',
  biweekly: 'Every 2 weeks',
  weekly: 'Weekly',
};

const pascalize = (name: string) =>
  name.split('-').map((p) => (p ? p[0].toUpperCase() + p.slice(1) : '')).join('');

function IconFor({ name }: { name: string | null }) {
  const Cmp = (name && (LucideIcons as never as Record<string, typeof Sparkles>)[pascalize(name)]) ?? Sparkles;
  return <Cmp className="h-4 w-4" />;
}

const currentPeriod = () => new Date().toISOString().slice(0, 7);

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-[hsl(var(--hairline))] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export default function DashboardServices() {
  const data = useDashboardData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useLanguage();

  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [attaches, setAttaches] = useState<AttachRow[]>([]);
  const [loadingAddons, setLoadingAddons] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<CanonService | null>(null);

  // Add-a-service state
  const [newService, setNewService] = useState<CanonService | null>(null);
  const [newSize, setNewSize] = useState<CanonSize>(1);
  const [newFrequency, setNewFrequency] = useState<Frequency>('monthly');
  const [startingCheckout, setStartingCheckout] = useState(false);

  const sub = data.subscription;
  const planServices = ((sub?.services ?? []) as CanonService[]).filter(Boolean);
  const missingServices = (['cleaning', 'lawn', 'detailing'] as CanonService[]).filter(
    (s) => !planServices.includes(s),
  );

  useEffect(() => {
    if (!data.loading && !data.isAuthed) navigate('/login', { replace: true });
  }, [data.loading, data.isAuthed, navigate]);

  useEffect(() => {
    if (planServices.length && !activeService) setActiveService(planServices[0]);
  }, [planServices, activeService]);

  useEffect(() => {
    if (!sub?.user_id) return;
    let cancelled = false;
    const load = async () => {
      const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const [catalogRes, attachRes] = await Promise.all([
        supabase
          .from('addon_catalog')
          .select('addon_key, display_name, price_cents, services, lucide_icon, sort_order, is_specialist')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('addon_attaches')
          .select('id, addon_key, addon_name, status, attached_at, is_free, free_period')
          .eq('user_id', sub.user_id)
          .gte('attached_at', since60),
      ]);
      if (cancelled) return;
      setCatalog((catalogRes.data as CatalogRow[]) ?? []);
      setAttaches((attachRes.data as AttachRow[]) ?? []);
      setLoadingAddons(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [sub?.user_id]);

  const targetVisit = data.nextVisit;
  const period = currentPeriod();

  const freeAllowance = Number(sub?.free_addons_per_month ?? 0);
  const freeUsedThisMonth = attaches.filter(
    (a) => a.is_free && a.free_period === period && a.status !== 'removed',
  );
  const freeRemaining = Math.max(freeAllowance - freeUsedThisMonth.length, 0);

  const pendingForVisit = attaches.filter((a) => a.status === 'pending_visit');
  const isAttached = (key: string) => pendingForVisit.some((a) => a.addon_key === key);

  const visibleAddons = useMemo(() => {
    if (!activeService) return [];
    const dbKey = SERVICE_DB_KEY[activeService];
    return catalog.filter((a) => a.services.includes(dbKey));
  }, [catalog, activeService]);

  const giftPool = visibleAddons.filter((a) => !a.is_specialist);

  const attach = async (addon: CatalogRow, free: boolean) => {
    setWorking(addon.addon_key);
    const { data: res, error } = await supabase.functions.invoke('attach-addon-to-visit', {
      body: {
        addon_key: addon.addon_key,
        jobber_visit_id: targetVisit?.jobber_visit_id ?? undefined,
        visit_date: targetVisit?.visit_date ?? undefined,
        redeem_free: free || undefined,
      },
    });
    setWorking(null);

    if (error || !res?.ok) {
      toast({
        title: t('Could not add'),
        description: res?.stripe_error ?? res?.error ?? error?.message ?? t('Try again in a moment.'),
        variant: 'destructive',
      });
      return;
    }
    setAttaches((prev) => [
      ...prev,
      {
        id: res.attach_id,
        addon_key: addon.addon_key,
        addon_name: addon.display_name,
        status: 'pending_visit',
        attached_at: new Date().toISOString(),
        is_free: !!res.is_free,
        free_period: res.free_period ?? null,
      },
    ]);
    toast({
      title: free ? t('Free add-on redeemed') : t('Added'),
      description: free
        ? `${addon.display_name} — ${t('on us this month.')}`
        : `${addon.display_name} — ${t('on your next invoice.')}`,
    });
  };

  const detach = async (addon: CatalogRow) => {
    const row = pendingForVisit.find((a) => a.addon_key === addon.addon_key);
    if (!row) return;
    setWorking(addon.addon_key);
    const { error } = await supabase.functions.invoke('detach-addon-from-visit', {
      body: { attach_id: row.id },
    });
    setWorking(null);
    if (error) {
      toast({ title: t('Could not remove'), description: error.message, variant: 'destructive' });
      return;
    }
    setAttaches((prev) => prev.filter((a) => a.id !== row.id));
    toast({ title: t('Removed') });
  };

  const addService = async () => {
    if (!newService) return;
    const zip = data.profile?.zip ?? sub?.founding_zip ?? '';
    if (!/^\d{5}$/.test(zip)) {
      toast({
        title: t('We need your ZIP first'),
        description: t('Add your service address in Account, then try again.'),
        variant: 'destructive',
      });
      return;
    }
    setStartingCheckout(true);
    const lines: CheckoutServiceLine[] = [
      { service: newService, size: newSize, frequency: newFrequency },
    ];
    try {
      await startAddServiceCheckout({ lines, zip, lang: language === 'es' ? 'es' : 'en' });
    } catch (err) {
      setStartingCheckout(false);
      toast({
        title: t('Could not start checkout'),
        description: err instanceof Error ? err.message : t('Try again in a moment.'),
        variant: 'destructive',
      });
    }
  };

  if (data.loading) return <RouteFallback />;

  const noPlan = !sub;

  return (
    <div className="min-h-screen bg-cream">
      <DashboardTopNav initials={data.initials} />

      <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
            {t('Services & add-ons')}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t('Redeem your free add-on, attach extras to your next visit, or add a service.')}
          </p>
        </header>

        {noPlan ? (
          <Card className="text-center">
            <h2 className="text-xl font-bold text-ink">{t('No plan yet.')}</h2>
            <p className="mt-2 text-sm text-ink-soft">
              {t('Set up your home and your add-ons unlock right after.')}
            </p>
            <Link
              to="/dashboard/plan"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-ink-soft"
            >
              {t('set up your home')} <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* ---------------- Free monthly add-on ---------------- */}
            {freeAllowance > 0 && (
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                    <Gift className="h-4 w-4 text-[hsl(var(--primary))]" />
                    {t('Your free add-on this month')}
                  </h2>
                  <span className="rounded-full bg-[hsl(var(--primary))]/10 px-3 py-1 text-xs font-semibold text-[hsl(var(--primary))]">
                    {freeRemaining > 0
                      ? `${freeRemaining} ${t('available')}`
                      : t('redeemed this month')}
                  </span>
                </div>

                {freeRemaining > 0 ? (
                  <>
                    <p className="mt-2 text-sm text-ink-soft">
                      {t('Two or more services means one premium add-on a month is on us — your pick.')}
                    </p>
                    {loadingAddons ? (
                      <div className="mt-5 flex items-center gap-2 text-ink-soft">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading…')}
                      </div>
                    ) : (
                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {giftPool.map((addon) => (
                          <div
                            key={`free-${addon.addon_key}`}
                            className="rounded-2xl border border-[hsl(var(--hairline))] bg-white p-4 transition hover:border-[hsl(var(--primary))]/40"
                          >
                            <div className="flex items-center gap-2 text-[hsl(var(--primary))]">
                              <IconFor name={addon.lucide_icon} />
                              <span className="text-sm font-semibold text-ink">{addon.display_name}</span>
                            </div>
                            <div className="mt-1 text-sm text-ink-soft">
                              <span className="line-through">${(addon.price_cents / 100).toFixed(0)}</span>{' '}
                              <span className="font-semibold text-[hsl(var(--primary))]">{t('free')}</span>
                            </div>
                            <button
                              type="button"
                              disabled={working === addon.addon_key}
                              onClick={() => attach(addon, true)}
                              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-ink-soft disabled:opacity-60"
                            >
                              {working === addon.addon_key ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Gift className="h-3.5 w-3.5" />
                              )}
                              {t('Use my free add-on')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-4 rounded-xl bg-cream/50 p-4 text-sm text-ink-soft">
                    {freeUsedThisMonth[0]?.addon_name
                      ? `${freeUsedThisMonth[0].addon_name} — ${t('on us this month. Your next free add-on unlocks next month.')}`
                      : t('Your next free add-on unlocks next month.')}
                  </div>
                )}
              </Card>
            )}

            {/* ---------------- Paid add-ons ---------------- */}
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                  <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
                  {t('Add to your next visit')}
                </h2>
                {targetVisit && (
                  <p className="text-sm text-ink-soft">
                    {serviceLabel(targetVisit.service)} · {formatLongDate(targetVisit.visit_date)}
                  </p>
                )}
              </div>

              {planServices.length > 1 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {planServices.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setActiveService(s)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        activeService === s ? 'bg-ink text-white' : 'bg-cream text-ink-soft hover:bg-cream-deep/40'
                      }`}
                    >
                      {SERVICE_NAMES[s]}
                    </button>
                  ))}
                </div>
              )}

              {loadingAddons ? (
                <div className="mt-5 flex items-center gap-2 text-ink-soft">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading…')}
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleAddons.map((addon) => {
                    const added = isAttached(addon.addon_key);
                    return (
                      <div
                        key={addon.addon_key}
                        className={`rounded-2xl border p-4 transition ${
                          added
                            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                            : 'border-[hsl(var(--hairline))] bg-white hover:border-[hsl(var(--primary))]/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-[hsl(var(--primary))]">
                              <IconFor name={addon.lucide_icon} />
                              <span className="text-sm font-semibold text-ink">{addon.display_name}</span>
                            </div>
                            <div className="mt-1 text-sm text-ink-soft">
                              ${(addon.price_cents / 100).toFixed(0)}
                              {addon.is_specialist && (
                                <span className="ml-2 text-[11px] text-ink-faint">{t('scheduled separately')}</span>
                              )}
                            </div>
                          </div>
                          {added ? (
                            <button
                              type="button"
                              disabled={working === addon.addon_key}
                              onClick={() => detach(addon)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--hairline))] px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
                            >
                              {working === addon.addon_key ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                              {t('Remove')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={working === addon.addon_key}
                              onClick={() => attach(addon, false)}
                              className="inline-flex items-center gap-1 rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-ink-soft disabled:opacity-60"
                            >
                              {working === addon.addon_key ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                              {t('Add')}
                            </button>
                          )}
                        </div>
                        {added && (
                          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                            <Check className="h-3 w-3" /> {t('Added')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-4 text-[11px] text-ink-faint">
                {t('Charged on your next invoice · remove any time before the visit')}
              </p>
            </Card>

            {/* ---------------- Add a service ---------------- */}
            <Card id="add-service">
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                <Plus className="h-4 w-4 text-[hsl(var(--primary))]" />
                {t('Add a service')}
              </h2>

              {missingServices.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">
                  {t('You already have all three services. Nice.')}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-ink-soft">
                    {t('Two or more services earns one free premium add-on every month.')}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {missingServices.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setNewService(s);
                          setNewSize(1);
                          setNewFrequency(SERVICE_UNIT[s] === 'per_month' ? 'monthly' : 'biweekly');
                        }}
                        className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
                          newService === s
                            ? 'border-ink bg-ink text-white'
                            : 'border-[hsl(var(--hairline))] bg-white text-ink hover:border-ink/40'
                        }`}
                      >
                        {SERVICE_NAMES[s]}
                      </button>
                    ))}
                  </div>

                  {newService && (
                    <div className="mt-5 space-y-5">
                      <div>
                        <h3 className="text-sm font-semibold text-ink-soft">{t('Size')}</h3>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {SIZES.map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => setNewSize(size)}
                              className={`rounded-xl border-2 p-3 text-left transition ${
                                newSize === size
                                  ? 'border-ink bg-ink text-white'
                                  : 'border-[hsl(var(--hairline))] bg-white hover:border-ink/40'
                              }`}
                            >
                              <div className="text-sm font-semibold">{SIZE_LABELS[newService][size]}</div>
                              <div className={`text-[11px] ${newSize === size ? 'text-white/70' : 'text-ink-faint'}`}>
                                {SIZE_HELPERS[newService][size]}
                              </div>
                              <div className="mt-1 text-sm font-bold tabular-nums">
                                ${SIZE_PRICES[newService][size]}
                                <span className="text-[11px] font-medium">
                                  {SERVICE_UNIT[newService] === 'per_month' ? t('/mo') : t('/visit')}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {SERVICE_UNIT[newService] === 'per_visit' && (
                        <div>
                          <h3 className="text-sm font-semibold text-ink-soft">{t('How often')}</h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {FREQUENCIES.map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setNewFrequency(f)}
                                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                  newFrequency === f
                                    ? 'bg-ink text-white'
                                    : 'bg-cream text-ink-soft hover:bg-cream-deep/40'
                                }`}
                              >
                                {t(FREQUENCY_LABEL[f])}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={startingCheckout}
                        onClick={addService}
                        className="inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_hsl(var(--ink)/0.55)] transition hover:bg-ink-soft disabled:opacity-60"
                      >
                        {startingCheckout ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                        {t('Continue to checkout')}
                      </button>
                      <p className="text-[11px] text-ink-faint">
                        {t('Prices are the same as your first plan. Cancel any time.')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
