/** Pro job card — the booked scope for this visit, read from service_scope at the member's version. */
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProCard } from "@/components/pro/portal/kit";
import { SCOPE_TITLE, txt, useScopeAtVersions, visitScopes, type ScopeService } from "@/lib/serviceScope";

type Card = { versions: Partial<Record<ScopeService, number>>; spigot: boolean | null; addons: { name: string; key: string; free: boolean }[]; monthly_lawn: boolean; weekly: boolean; visit_kind: string | null };

export default function ProJobCard({ visitId, serviceType }: { visitId: string; serviceType: string | null }) {
  const { language } = useLanguage();
  const es = language === "es";
  const [card, setCard] = useState<Card | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    void supabase.rpc("pro_job_card" as never, { _visit: visitId } as never).then(({ data, error }) => {
      if (error) setErr(true); else setCard(data as unknown as Card);
    });
  }, [visitId]);
  const scopes = card ? visitScopes(serviceType, card.visit_kind) : [];
  const versions = card ? Object.fromEntries(scopes.map((s) => [s, card.versions[s] ?? 1])) : null;
  const { data: rows = [] } = useScopeAtVersions(versions as Partial<Record<ScopeService, number>> | null);
  if (err) return null;
  if (!card) return null;
  const isCar = serviceType === "detailing" || card.visit_kind === "car_wash";
  const sec = (svc: ScopeService, s: string) => rows.filter((r) => r.service === svc && r.section === s);
  const growth = rows.find((r) => r.section === "notice" && r.notice_key?.includes("growth"));
  return (
    <ProCard>
      <p className="text-[15px] font-extrabold text-[hsl(var(--pro-ink))]">{es ? "Qué incluye esta visita" : "What this visit includes"}</p>
      <p className="mt-1 rounded-lg bg-[hsl(var(--pro-navy))] px-3 py-2 text-[13px] font-bold text-white">
        {es ? "Haga solo lo indicado aquí. Para cualquier trabajo adicional, contacte a Tidy; no lo acuerde en la puerta." : "Do only what's on this card. Anything else: message Tidy, don't agree at the door."}
      </p>
      {scopes.map((svc) => (
        <div key={svc} className="mt-3 space-y-2">
          <p className="text-[13px] font-bold text-[hsl(var(--pro-ink))]">{SCOPE_TITLE[svc][es ? 1 : 0]}</p>
          <List title={es ? "Incluido" : "Included"} items={sec(svc, "included").map((r) => txt(r, language))} />
          <List title={es ? "No incluido" : "Not included"} items={sec(svc, "not_included").map((r) => txt(r, language))} />
          <List title={es ? "El miembro debe" : "The customer needs to"} items={sec(svc, "customer_must").map((r) => txt(r, language))} />
        </div>
      ))}
      {card.monthly_lawn && growth && <p className="mt-2 text-[13px] text-[hsl(var(--pro-ink-soft))]">{txt(growth, language)}</p>}
      <List title={es ? "Extras aprobados" : "Approved add-ons"} items={card.addons.length ? card.addons.map((a) => a.name + (a.free ? (es ? " (regalo)" : " (free gift)") : "")) : [es ? "Ninguno" : "None"]} />
      {isCar && (
        <p className="mt-2 text-[13px] font-semibold text-[hsl(var(--pro-ink))]">
          {es ? "Agua en el estacionamiento" : "Water at the parking spot"}: {card.spigot === true ? (es ? "Sí — el miembro tiene grifo exterior" : "Yes — customer has an outdoor spigot") : card.spigot === false ? (es ? "No — traiga su propia agua" : "No — bring your own water") : (es ? "Sin respuesta — traiga su propia agua" : "Not answered — bring your own water")}
        </p>
      )}
    </ProCard>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className="text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-[hsl(var(--pro-ink))]">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}
