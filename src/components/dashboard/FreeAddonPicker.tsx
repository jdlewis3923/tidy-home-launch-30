/**
 * Free add-on entitlements (ledger: addon_entitlements).
 * Type A founding_first_visit — one gift on the first visit (founding homes).
 * Type B bundle_monthly — 1 a month for two services, 2 for three; expires unused.
 * Choosing goes through choose_free_addon(), which attaches it to the visit like a
 * paid add-on and pays the Pro the normal 40%.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";

type Ent = {
  id: string; type: "founding_first_visit" | "bundle_monthly"; period: string | null;
  status: "available" | "chosen" | "redeemed" | "expired"; chosen_addon: string | null; attached_visit_id: string | null;
};
type Addon = { addon_key: string; display_name: string; price_cents: number; services: string[] };
type Visit = { id: string; visit_date: string; service: string; status: string; visit_kind: string | null };

const fits = (a: Addon, service: string) => a.services.includes(service) || (service === "detailing" && a.services.includes("detail"));
const thisPeriod = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);

export default function FreeAddonPicker() {
  const { t, language } = useLanguage();
  const [ents, setEnts] = useState<Ent[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const period = thisPeriod();
    const [e, a, v] = await Promise.all([
      supabase.from("addon_entitlements").select("id, type, period, status, chosen_addon, attached_visit_id")
        .or(`type.eq.founding_first_visit,period.eq.${period}`).neq("status", "expired").order("granted_at"),
      supabase.from("addon_catalog").select("addon_key, display_name, price_cents, services")
        .eq("is_active", true).eq("gift_eligible", true).lte("price_cents", 5500).order("sort_order"),
      supabase.from("visits").select("id, visit_date, service, status, visit_kind")
        .gte("visit_date", new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10)).order("visit_date").limit(60),
    ]);
    setEnts((e.data as Ent[]) ?? []);
    setAddons(((a.data as Addon[]) ?? []).filter((x) => !x.addon_key.startsWith("wash")));
    setVisits(((v.data as Visit[]) ?? []).filter((x) => x.visit_kind !== "car_wash"));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(language === "es" ? "es-US" : "en-US", { weekday: "long", day: "numeric", month: "short" });
  const nameOf = (k: string | null) => addons.find((a) => a.addon_key === k)?.display_name ?? k ?? "";
  const visitOf = (id: string | null) => visits.find((v) => v.id === id);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return visits.filter((v) => v.visit_date >= today && ["scheduled", "on_the_way"].includes(v.status));
  }, [visits]);
  const firstVisit = useMemo(() => visits.find((v) => !["canceled", "skipped"].includes(v.status)), [visits]);

  const targetFor = (ent: Ent, addon: Addon) => {
    if (ent.type === "founding_first_visit") {
      return firstVisit && upcoming.some((u) => u.id === firstVisit.id) && fits(addon, firstVisit.service) ? firstVisit : undefined;
    }
    return upcoming.find((v) => fits(addon, v.service) && v.visit_date.slice(0, 7) === ent.period);
  };

  const choose = async (ent: Ent, addon: Addon) => {
    const visit = targetFor(ent, addon);
    if (!visit) return;
    setWorking(addon.addon_key);
    const { error } = await supabase.rpc("choose_free_addon", { _entitlement: ent.id, _addon_key: addon.addon_key, _visit: visit.id });
    setWorking(null);
    if (error) { toast({ title: t("Could not add"), description: error.message, variant: "destructive" }); return; }
    setPicking(null);
    await load();
  };

  if (loading || ents.length === 0) return null;
  const bundleAvail = ents.filter((e) => e.status === "available" && e.type === "bundle_monthly").length;

  return (
    <section className="rounded-3xl border border-[hsl(var(--hairline))] bg-card p-6 shadow-sm" data-testid="free-addon-picker">
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Gift className="h-4 w-4 text-[hsl(var(--primary))]" /> {t("Your free add-ons")}
      </h2>
      {bundleAvail > 0 && (
        <p className="mt-2 text-sm text-ink-soft">
          {bundleAvail === 1 ? t("You have 1 free add-on this month. Pick one.") : t("You have 2 free add-ons this month. Pick them.")}
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {ents.map((e) => {
          const label = e.type === "founding_first_visit" ? t("Founding gift — first visit") : t("This month's free add-on");
          if (e.status === "chosen" || e.status === "redeemed") {
            const v = visitOf(e.attached_visit_id);
            return (
              <li key={e.id} className="rounded-2xl bg-[hsl(var(--muted))] px-4 py-3 text-sm text-ink">
                <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
                {e.status === "redeemed"
                  ? <>{t(nameOf(e.chosen_addon))} — {t("Used")} <CheckCircle2 className="inline h-4 w-4 text-[hsl(var(--primary))]" /></>
                  : <>{t(nameOf(e.chosen_addon))} — {t("free, on your visit")} {v ? fmt(v.visit_date) : ""}.</>}
              </li>
            );
          }
          return (
            <li key={e.id} className="rounded-2xl border border-[hsl(var(--hairline))] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink">{label}</span>
                <button type="button" onClick={() => setPicking(picking === e.id ? null : e.id)}
                  className="rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                  {picking === e.id ? t("Close") : t("Pick one")}
                </button>
              </div>
              {picking === e.id && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {addons.map((a) => {
                    const target = targetFor(e, a);
                    return (
                      <button key={a.addon_key} type="button" disabled={!target || working !== null} onClick={() => choose(e, a)}
                        className="flex items-center justify-between rounded-xl border border-[hsl(var(--hairline))] px-3 py-2 text-left text-sm transition hover:border-[hsl(var(--primary))] disabled:opacity-50">
                        <span className="text-ink">{t(a.display_name)}
                          <span className="block text-xs text-ink-soft">
                            <span className="line-through">${(a.price_cents / 100).toFixed(0)}</span> · {target ? fmt(target.visit_date) : t("no matching visit")}
                          </span>
                        </span>
                        {working === a.addon_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-semibold text-[hsl(var(--primary))]">{t("free")}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
