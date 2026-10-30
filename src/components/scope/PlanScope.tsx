import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { ScopeBlock, VisitRulesList } from "@/components/scope/ServiceScope";
import { GROUP_SCOPES, groupsFor, useScopeAtVersions, type ScopeService } from "@/lib/serviceScope";
import ScopeChangeNotice from './ScopeChangeNotice';

/** Account page: "Your plan includes" at the version each member is held to, plus "How visits work". */
export function PlanScope({ services, carWash, monthlyLawn, weekly }: { services: string[]; carWash?: boolean; monthlyLawn?: boolean; weekly?: boolean }) {
  const { language } = useLanguage();
  const es = language === "es";
  const scopes = [...new Set(groupsFor(services, carWash).flatMap((g) => GROUP_SCOPES[g]))]
    .filter((s) => s !== "cleaning_deep_clean" || weekly);
  const [versions, setVersions] = useState<Partial<Record<ScopeService, number>> | null>(null);
  useEffect(() => {
    let off = false;
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      const out: Partial<Record<ScopeService, number>> = {};
      for (const s of scopes) {
        const { data } = await supabase.rpc("member_scope_version", { _user: u?.user?.id ?? "", _service: s });
        out[s] = typeof data === "number" ? data : 1;
      }
      if (!off) setVersions(out);
    })();
    return () => { off = true; };
  }, [scopes.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: rows = [] } = useScopeAtVersions(versions);
  const acknowledgments = useQuery({ queryKey: ['service_acknowledgments', 'mine'], queryFn: async () => {
    const {data:auth}=await supabase.auth.getUser();if(!auth.user)return [];
    const { data, error } = await supabase.from('service_acknowledgments').select('service,checked_at').eq('member_id',auth.user.id).order('checked_at', { ascending: false });
    if (error) throw error; return data ?? [];
  }});
  if (!scopes.length) return null;
  return (
    <div className="rounded-2xl border border-[hsl(var(--hairline))] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]" data-testid="plan-scope">
      <h2 className="text-lg font-black text-ink">{es ? "Su plan incluye" : "Your plan includes"}</h2>
      <ScopeChangeNotice />
      <div className="mt-4 space-y-8">
        {scopes.map((s) => <section key={s}><ScopeBlock service={s} rows={rows} lang={language} opts={{ monthlyLawn, weekly }} />
          {acknowledgments.data?.find(a => a.service === s) && <p className="mt-3 text-xs text-muted-foreground">{es ? 'Detalles del plan aceptados' : 'Plan details acknowledged'} {new Date(acknowledgments.data.find(a => a.service === s)?.checked_at ?? '').toLocaleDateString(es ? 'es-US' : 'en-US')}</p>}
        </section>)}
      </div>
      <details className="mt-6 rounded-xl border border-[hsl(var(--hairline))] p-4">
        <summary className="cursor-pointer text-sm font-bold text-ink">{es ? "Así funcionan las visitas" : "How visits work"}</summary>
        <div className="mt-3"><VisitRulesList /></div>
      </details>
    </div>
  );
}

/** A size-up notice the member must answer before anything is repriced. */
export function SizeReviewPrompt() {
  const { language } = useLanguage();
  const es = language === "es";
  const q = useQuery({
    queryKey: ["size_reviews", "mine"],
    queryFn: async () => {
      const { data } = await supabase.from("size_reviews").select("id, service, new_monthly_cents, old_monthly_cents, status").eq("status", "customer_notified");
      return data ?? [];
    },
  });
  const [busy, setBusy] = useState(false);
  const answer = async (id: string, confirm: boolean) => {
    setBusy(true);
    await supabase.rpc("member_size_review_respond", { _review: id, _confirm: confirm });
    setBusy(false);
    void q.refetch();
  };
  if (!q.data?.length) return null;
  return (
    <>
      {q.data.map((r) => (
        <div key={r.id} className="rounded-2xl border-2 border-primary/40 bg-white p-6">
          <h2 className="text-base font-black text-ink">{es ? "Revise el tamaño de su plan" : "Check your plan size"}</h2>
          <p className="mt-2 text-sm text-ink">
            {es
              ? `En su primera visita su Pro encontró un ${r.service === "cleaning" ? "hogar" : "vehículo"} más grande que su plan. El plan correcto es $${((r.new_monthly_cents ?? 0) / 100).toFixed(2)} al mes (ahora $${((r.old_monthly_cents ?? 0) / 100).toFixed(2)}). Nada cambia hasta que confirme. También puede cancelar.`
              : `At your first visit your Pro found a larger ${r.service === "cleaning" ? "home" : "vehicle"} than your plan covers. The right plan is $${((r.new_monthly_cents ?? 0) / 100).toFixed(2)} a month (now $${((r.old_monthly_cents ?? 0) / 100).toFixed(2)}). Nothing changes until you confirm. You can cancel instead.`}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={busy} onClick={() => answer(r.id, true)} className="min-h-[44px] rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{es ? "Confirmar el nuevo tamaño" : "Confirm the new size"}</button>
            <button type="button" disabled={busy} onClick={() => answer(r.id, false)} className="min-h-[44px] rounded-xl border-2 border-border px-4 text-sm font-bold text-ink disabled:opacity-50">{es ? "Prefiero cancelar" : "I'd rather cancel"}</button>
          </div>
        </div>
      ))}
    </>
  );
}
