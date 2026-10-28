/**
 * Visit detail — /pro/visit/:id
 * Action stack: On my way -> Upload photos -> Complete visit.
 * Complete stays disabled until at least one before and one after photo exist;
 * the same rule is re-checked server-side before anything is stamped.
 * The map is a static, informational preview: no tracking, no location dot.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ProVisitExtras from "@/components/pro/ProVisitExtras";
import ProJobCard from "@/components/pro/ProJobCard";
import LawnJobSize from "@/components/pro/ProLawnJobSize";
import { AlertTriangle, Check, ListChecks, Send } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import {
  ErrorState, InfoRow, MapPreview, ProButton, ProCard, Skeleton, StatusPill,
} from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { VISIT_KIND_LABEL, dayLabel, timeWindow, visitAction } from "@/lib/pro-portal";
import { SERVICE_LABEL, money } from "@/lib/pro-pay";
import CleaningTeamInspection from '@/components/pro/CleaningTeamInspection';
import { useLanguage } from '@/contexts/LanguageContext';
import { navigationLinks, accessWindowOpen } from '@/lib/pro-visit-rules';
import { Button } from '@/components/ui/button';

export default function ProVisit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const es = language === 'es';
  const { visits, coi, loading, error, reload } = useProSession();
  const visit = useMemo(() => visits.find((v) => v.id === id) ?? null, [visits, id]);

  const [busy, setBusy] = useState<null | "omw" | "complete" | "blocked">(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState<"customer_no_access" | "unsafe_conditions">("customer_no_access");
  const [blockNote, setBlockNote] = useState("");
  const [blockedDone, setBlockedDone] = useState(false);
  const [omwSent, setOmwSent] = useState(false);
  const [eta, setEta] = useState(20);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [vclass, setVclass] = useState("sedan");
  const [plate, setPlate] = useState("");
  const [reportedPay, setReportedPay] = useState<number | null>(null);
  const [locationReason,setLocationReason] = useState('');
  const [homeContext,setHomeContext] = useState<{home_notes?:string;rotation?:string;zones?:unknown[];team?:{lead?:string;partner?:string};access_open?:boolean}|null>(null);
  useEffect(()=>{
    let canceled=false;
    if(id) void import('@/integrations/supabase/client').then(({supabase})=>supabase.rpc('pro_visit_context',{_visit:id})).then(({data})=>{if(!canceled)setHomeContext(data as typeof homeContext);});
    return()=>{canceled=true;};
  },[id]);

  // Live location pings while en route or on site, so the owner tracker can
  // see distance to the job. Visibility only — pings never affect pay or
  // the 150 m check-in rules. Stops when the visit is no longer active.
  useEffect(() => {
    if (!visit || !['on_the_way', 'in_progress'].includes(visit.status ?? '')) return;
    const ping = () => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          void import('@/integrations/supabase/client').then(({ supabase }) =>
            supabase.functions.invoke('pro-location-ping', {
              body: {
                visit_id: visit.id,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy_m: Math.round(pos.coords.accuracy ?? 0),
              },
            }),
          );
        },
        () => undefined,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    };
    ping();
    const timer = window.setInterval(ping, 3 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [visit?.id, visit?.status]);

  const GPS_MSG = es ? "Active la ubicación para este sitio en su teléfono y vuelva a intentar. La llegada y la salida requieren su ubicación." : "Turn on location for this site in your phone settings, then try again. Check-in and check-out need your location.";

  const checkIn = async () => {
    if (!visit) return;
    setBusy("omw");
    setActionError(null);
    const res = await visitAction(visit.id, "check_in", {location_reason:locationReason.trim()||undefined});
    setBusy(null);
    if (!res.ok) { setActionError(res.error === "gps_unavailable" ? GPS_MSG : res.error?.includes('reason_required') ? (es?'Está fuera de 150 m o la ubicación de la dirección no está verificada. Escriba el motivo y vuelva a intentar.':'Outside 150 m or the address location is unverified. Add a reason and try again.') : (es?'No se pudo registrar la llegada.':"Couldn't check you in.")); return; }
    setCheckedIn(true);
  };

  const saveSize = async () => {
    if (!visit) return;
    const isCar = visit.service_type === "detailing";
    const body = isCar
      ? { vehicle_class: vclass, plate: plate.trim() }
      : { sq_ft: parseInt(beds, 10), bathrooms: parseFloat(baths) };
    if (isCar ? !plate.trim() : !(beds && baths)) { setActionError(isCar ? (es ? "Agregue el tipo de vehículo y la placa." : "Add the vehicle type and plate.") : (es ? "Agregue pies cuadrados y baños." : "Add square feet and bathrooms.")); return; }
    setBusy("complete");
    const res = await visitAction(visit.id, "size_check", body);
    setBusy(null);
    if (!res.ok) { setActionError((es ? "No se pudo guardar el tamaño. Vuelva a intentar." : "Couldn't save the size. Try again.")); return; }
    setSizeOpen(false);
    setActionError(null);
    void complete();
  };

  useEffect(() => {
    if (visit?.on_my_way_at) setOmwSent(true);
    setCheckedIn(visit?.checked_in === true);
  }, [visit?.on_my_way_at, visit?.checked_in]);

  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => { setClock(Date.now()); }, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => reload(), 60_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const photosOk = (visit?.before_photos ?? 0) > 0 && (visit?.after_photos ?? 0) > 0;
  const blocked = !coi?.can_work;

  const onMyWay = async () => {
    if (!visit) return;
    setBusy("omw");
    setActionError(null);
    const res = await visitAction(visit.id, "on_my_way", { eta_minutes: eta });
    setBusy(null);
    if (!res.ok) {
      setActionError(
        res.error === "coi_blocked"
          ? (es ? "Su certificado de seguro debe estar vigente antes de iniciar una visita." : "Your insurance certificate must be valid before you start a visit.")
          : (es ? "No se pudo enviar su aviso de llegada." : "Couldn't send your on-my-way message."),
      );
      return;
    }
    setOmwSent(true);
    reload();
  };

  // Arrived and could not work through no fault of the pro. Canon pays the
  // visit in full; the server re-checks that "on my way" was already sent.
  const reportBlocked = async () => {
    if (!visit) return;
    setBusy("blocked");
    setActionError(null);
    const res = await visitAction(visit.id, "blocked", { reason: blockReason, note: blockNote.trim() });
    setBusy(null);
    if (!res.ok) {
      setActionError(
        res.error === "on_my_way_required"
          ? (es ? "Envíe primero el aviso de que va en camino." : "Send your on-my-way message first, then report this.")
          : res.error === "invalid_body"
            ? (es ? "Agregue más detalle (al menos 10 caracteres)." : "Add a little more detail (at least 10 characters).")
            : (es ? "No se pudo reportar esta visita." : "Couldn't report this visit."),
      );
      return;
    }
    setBlockOpen(false);
    setReportedPay(res.visit_pay_cents ?? null);
    setBlockedDone(true);
    setSuccess(true);
    setTimeout(() => {
      reload();
      navigate("/pro/schedule");
    }, 1600);
  };

  const complete = async () => {
    if (!visit) return;
    setBusy("complete");
    setActionError(null);
    const res = await visitAction(visit.id, "complete", {location_reason:locationReason.trim()||undefined});
    setBusy(null);
    setConfirm(false);
    if (!res.ok) {
      if(res.error?.includes('reason_required')) {setActionError(es?'Agregue el motivo de ubicación antes de registrar la salida.':'Add a location reason before checking out.');return;}
      if(res.error?.includes('service_checklist_required')||res.error==='booked_addons_incomplete') {setActionError(es?'Complete cada tarea, extra reservado y punto de salida.':'Complete every work item, booked add-on and exit check.');return;}
      if (res.error === "size_check_required") { setSizeOpen(true); setActionError((es ? "Primera visita: registre el tamaño real antes de terminar." : "First visit: record the real size before you finish.")); return; }
      if (res.error === 'both_pros_check_out_required') {setActionError((es ? "Ambos Pros deben registrar llegada y salida antes de que el Líder complete la visita." : "Both Pros must check in and check out before the Lead completes the visit."));return;}
      if (res.error === 'lead_inspection_and_zones_required') {setActionError((es ? "Guarde las zonas y la inspección final antes de completar la visita." : "Save room zones and the final inspection before completing the visit."));return;}
      if (res.error === 'lead_action_required') {setActionError((es ? "El Líder completa esta visita. Registre su salida abajo." : "The Lead completes this team visit. Record your check-out below."));return;}
      if (res.error === 'secure_exit_checklist_required') {setActionError((es ? "Confirme la lista de salida segura antes de completar la visita." : "Confirm the secure-exit items in the checklist before completing the visit."));return;}
      setActionError(
        res.error === "gps_unavailable"
          ? GPS_MSG
          : res.error === "gps_check_in_required"
          ? (es ? "Registre su llegada antes de completar la visita." : "Tap \\\"I've arrived\\\" when you get there, then finish the visit.")
          : res.error === "before_photos_required" || res.error === "after_photos_required"
          ? (visit.service_type === "detailing" ? (es ? "Las visitas de auto requieren 6 fotos previas y posteriores desde los mismos ángulos." : "Car visits need 6 before photos and after photos from the same angles.") : (es ? "Agregue primero las fotos de antes y después." : "Add the before and after photos from the checklist first."))
          : res.error === "photos_required"
          ? (es ? "Agregue al menos una foto de antes y una de después." : "Add at least one before photo and one after photo first.")
          : res.error === "coi_blocked"
            ? (es ? "Su certificado de seguro debe estar vigente antes de completar una visita." : "Your insurance certificate must be valid before you complete a visit.")
            : (es ? "No se pudo completar esta visita." : "Couldn't complete this visit."),
      );
      return;
    }
    setReportedPay(res.visit_pay_cents ?? null);
    setSuccess(true);
    setTimeout(() => {
      reload();
      navigate("/pro/schedule");
    }, 1200);
  };

  if (loading) {
    return (
      <ProShell title={es ? "Visita" : "Visit"} back="/pro/schedule">
        <div className="space-y-5 px-[18px] py-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
        </div>
      </ProShell>
    );
  }

  if (error || !visit) {
    return (
      <ProShell title={es ? "Visita" : "Visit"} back="/pro/schedule">
        <ErrorState title={es ? "No se pudo cargar esta visita" : "Couldn't load this visit"} onRetry={reload} />
      </ProShell>
    );
  }

  if (success) {
    return (
      <ProShell title={es ? "Visita completa" : "Visit complete"} back="/pro/schedule" nav={false}>
        <div className="flex flex-col items-center px-8 py-20 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[hsl(var(--pro-green-soft))]">
            <Check className="h-8 w-8 text-[hsl(var(--pro-green))]" aria-hidden />
          </span>
          <p className="mt-4 text-[18px] font-extrabold text-[hsl(var(--pro-ink))]">
            {blockedDone
              ? `Reported — ${money(reportedPay)} added to your earnings.`
              : `Visit complete — ${money(reportedPay)} added to this week's earnings.`}
          </p>
        </div>
      </ProShell>
    );
  }

  return (
    <ProShell title={es ? (visit.service_type === "cleaning" ? "Limpieza" : visit.service_type === "lawn" ? "Césped" : "Cuidado del Auto") : SERVICE_LABEL[visit.service_type ?? ""] ?? "Visit"} back="/pro/schedule">
      <div className="bg-white px-4 pb-4 pt-4">
        <p className="text-[14px] font-semibold text-[hsl(var(--pro-ink-soft))]">
          {dayLabel(visit.scheduled_start, language)}
        </p>
        <p className="text-[16px] font-bold text-[hsl(var(--pro-ink))]">
          {timeWindow(visit.scheduled_start, visit.scheduled_end, language)}
        </p>
        <div className="mt-3 flex items-end justify-between">
          <p className="text-[34px] font-extrabold leading-none text-[hsl(var(--pro-ink))]">
            {money(visit.visit_pay_cents)}
          </p>
          <div className="flex gap-2">
            {visit.visit_kind && VISIT_KIND_LABEL[visit.visit_kind] && (
              <StatusPill tone="blue">{es ? ({full_detail:"Detalle completo",maintenance_wash:"Lavado de mantenimiento",quarterly_deep_clean:"Limpieza profunda trimestral"}[visit.visit_kind] ?? visit.visit_kind) : VISIT_KIND_LABEL[visit.visit_kind]}</StatusPill>
            )}
            {visit.is_sample && <StatusPill tone="neutral">{es ? "Muestra" : "Sample"}</StatusPill>}
            {visit.completed_at ? (
              <StatusPill tone="green">{es ? "Completa" : "Completed"}</StatusPill>
            ) : omwSent ? (
              <StatusPill tone="blue">{es ? "Voy en camino" : "On my way"}</StatusPill>
            ) : (
              <StatusPill tone="neutral">{es ? "Programada" : "Scheduled"}</StatusPill>
            )}
          </div>
        </div>
        {visit.service_type === "lawn" && <LawnJobSize visitId={visit.id} fallbackPayCents={visit.visit_pay_cents} />}
        <p className="mt-1 text-[13px] text-[hsl(var(--pro-ink-soft))]">{es ? "Pago fijo por esta visita completada" : "Flat pay for this completed visit"}</p>
      </div>

      <MapPreview street={visit.street} zip={visit.zip} />
      <section className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap gap-2 text-sm text-foreground">
          {visit.size_tier && <span>{visit.size_tier === 5 ? 'Estate Plus' : visit.size_tier === 4 ? 'Estate' : `${es ? 'Tamaño' : 'Size'} ${visit.size_tier}`}</span>}
          {visit.is_team && <StatusPill tone="gold">{visit.is_lead ? (es ? 'Líder' : 'Lead') : (es ? 'Equipo' : 'Team')}</StatusPill>}
          {visit.first_visit && <StatusPill tone="blue">{es ? 'Primera visita' : 'First visit'}</StatusPill>}
        </div>
        {visit.first_visit && <p className="text-sm text-muted-foreground">{es ? 'Recorrido inicial y entrega del sello de ventana.' : 'Initial walkthrough and window seal handover.'}{(visit.size_tier ?? 0) >= 4 ? (es ? ' Pago de primera visita: 1.5×.' : ' First-visit pay: 1.5×.') : ''}</p>}
        {visit.street && (() => {
          const addr = [visit.street, visit.zip].filter(Boolean).join(', ');
          return (
            <div className="space-y-2" aria-label={es ? 'Navegar' : 'Navigate'}>
              <ProButton className="w-full" asChild>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`} target="_blank" rel="noopener noreferrer">
                  {es ? 'Ir ahora' : 'Go now'}
                </a>
              </ProButton>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(navigationLinks(addr)).map(([provider, url]) => <Button key={provider} variant="outline" size="sm" asChild><a href={url} target="_blank" rel="noopener noreferrer">{provider === 'google' ? 'Google Maps' : provider === 'apple' ? 'Apple Maps' : 'Waze'}</a></Button>)}
              </div>
            </div>
          );
        })()}
      </section>

      <div className="px-4 pt-4"><ProJobCard visitId={visit.id} serviceType={visit.service_type} /></div>

      <div className="p-4">
        <ProCard>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
            {es ? "Miembro" : "Customer"}
          </p>
          <p className="text-[18px] font-bold text-[hsl(var(--pro-ink))]">
            {visit.customer_first_name ?? "—"}
          </p>
          <p className="mt-2 text-[17px] font-bold text-[hsl(var(--pro-ink))]">{visit.street ?? "—"}</p>
          <p className="text-[15px] text-[hsl(var(--pro-ink-soft))]">{visit.zip ?? ""}</p>
        </ProCard>

        <ProCard className="mt-3">
          <p className="pb-1 text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">
            {es ? "Detalles de acceso" : "Access details"}
          </p>
          {accessWindowOpen(visit.scheduled_start, visit.checked_out === true || !!visit.completed_at, clock) && visit.access_notes && <InfoRow kind="access" label={es ? 'Acceso' : 'Access'} value={visit.access_notes} />}
          {accessWindowOpen(visit.scheduled_start, visit.checked_out === true || !!visit.completed_at, clock) && visit.gate_code && <InfoRow kind="gate" label={es ? 'Código de puerta' : 'Gate code'} value={visit.gate_code} />}
          {!accessWindowOpen(visit.scheduled_start, visit.checked_out === true || !!visit.completed_at, clock) && <p className="py-2 text-sm text-muted-foreground">{es ? 'Los códigos se muestran desde 30 minutos antes de su ventana hasta registrar la salida.' : 'Codes appear 30 minutes before your window and hide at check-out.'}</p>}
          {visit.pet_notes && <InfoRow kind="pet" label={es ? "Mascotas" : "Pets"} value={visit.pet_notes} />}
          {visit.parking_notes && <InfoRow kind="parking" label={es ? "Estacionamiento" : "Parking"} value={visit.parking_notes} />}
          {!visit.access_notes && !visit.gate_code && !visit.pet_notes && !visit.parking_notes && (
            <p className="py-2 text-[14px] text-[hsl(var(--pro-ink-soft))]">
              {es ? "Sin notas de acceso para esta visita." : "No access notes on this visit."}
            </p>
          )}
        </ProCard>
        <ProVisitExtras visitId={visit.id} accessOpen={accessWindowOpen(visit.scheduled_start, visit.checked_out === true || !!visit.completed_at, clock)} />
        {homeContext && <section className="mt-4 space-y-3 border-y border-border py-4">
          {homeContext.home_notes && <div><h2 className="font-semibold text-foreground">{es?'Notas del hogar':'Home notes'}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{homeContext.home_notes}</p></div>}
          {homeContext.rotation && <p className="text-sm text-foreground">{es?'Tarea rotativa':'Rotation task'}: {({baseboards:es?'Zócalos':'Baseboards',blinds:es?'Persianas':'Blinds',fans_fixtures:es?'Ventiladores y lámparas':'Fans and fixtures',cabinet_fronts:es?'Frentes de gabinetes':'Cabinet fronts',vents:es?'Rejillas':'Vents'} as Record<string,string>)[homeContext.rotation] ?? homeContext.rotation}</p>}
          {homeContext.team && <p className="text-sm text-foreground">{es?'Equipo':'Team'}: {[homeContext.team.lead,homeContext.team.partner].filter(Boolean).join(' · ')}</p>}
          {(homeContext.zones?.length ?? 0)>0 && <div><h2 className="font-semibold text-foreground">{es?'Zonas':'Zones'}</h2><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{homeContext.zones?.map((zone,i)=><li key={i}>{typeof zone==='string' ? zone : JSON.stringify(zone)}</li>)}</ul></div>}
        </section>}
        {!visit.completed_at&&<Button variant="outline" asChild className="mt-4 w-full"><Link to={`/pro/job/${visit.id}`}>{es?'Necesita más tiempo — solicitar un extra':'Needs extra time — request an add-on'}</Link></Button>}

        <Link
          to={`/pro/visit/${visit.id}/checklist`}
          className="mt-3 flex min-h-[52px] items-center gap-3 rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white px-4"
        >
          <ListChecks className="h-5 w-5 text-[hsl(var(--pro-blue))]" aria-hidden />
            <span className="flex-1 text-[15px] font-bold text-[hsl(var(--pro-ink))]">{es?'Ver lista de trabajo':'View checklist'}</span>
        </Link>

        {actionError && (
          <p className="mt-4 rounded-xl bg-[hsl(var(--pro-red-soft))] p-3 text-[14px] font-semibold text-[hsl(var(--pro-red))]">
            {actionError}
          </p>
        )}

        <div className="mt-5 space-y-3">
          {!omwSent && !visit.completed_at && (
            <div>
              <p className="text-[13px] font-bold text-[hsl(var(--pro-ink))]">{es ? "¿A cuántos minutos está?" : "About how many minutes away?"}</p>
              <div className="mt-2 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={es ? "Minutos de distancia" : "Minutes away"}>
                {[10, 20, 30, 45].map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={eta === m} onClick={() => setEta(m)}
                    className={`min-h-[44px] rounded-lg text-[14px] font-bold ${eta === m ? "bg-[hsl(var(--pro-navy))] text-white" : "border border-[hsl(var(--pro-navy)/0.12)] text-[hsl(var(--pro-ink))]"}`}>
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          )}
          <ProButton
            full
            disabled={busy !== null || omwSent || blocked || !!visit.completed_at}
            onClick={() => void onMyWay()}
          >
            {omwSent ? (
              <>
                <Check className="h-4 w-4" aria-hidden /> {es ? "Miembro notificado" : "Customer notified"}
              </>
            ) : (
              <>
                <Send className={`h-4 w-4 ${busy === "omw" ? "pro-plane" : ""}`} aria-hidden /> {es?'Voy en camino':'On my way'}
              </>
            )}
          </ProButton>

          <label className="block space-y-2 text-sm text-foreground"><span>{es?'Motivo de ubicación (solo fuera de 150 m o dirección sin verificar)':'Location reason (only outside 150 m or unverified address)'}</span><textarea value={locationReason} onChange={e=>setLocationReason(e.target.value)} rows={2} maxLength={500} className="w-full rounded-lg border border-input bg-background p-3"/></label>

          <ProButton
            full
            variant="outlined"
            disabled={busy !== null || checkedIn || blocked || !!visit.completed_at}
            onClick={() => void checkIn()}
          >
            {checkedIn ? <><Check className="h-4 w-4" aria-hidden /> {es?'Llegada registrada':'Checked in'}</> : (es?'Llegué — registrar llegada':"I've arrived — check in")}
          </ProButton>

          {sizeOpen && (
            <ProCard>
              <p className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">{es ? "Primera visita — tamaño real" : "First visit \u2014 real size"}</p>
              {visit.service_type === "detailing" ? (
                <div className="mt-2 space-y-2">
                  <select value={vclass} onChange={(e) => setVclass(e.target.value)} className="min-h-[44px] w-full rounded-xl border px-3 text-[15px]">
                    {[["sedan","Sedan"],["coupe","Coupe"],["suv","SUV"],["crossover","Crossover"],["truck","Truck"],["suv3row","3-row SUV"],["van","Van"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} maxLength={15} placeholder={es ? "Placa" : "Plate"} className="min-h-[44px] w-full rounded-xl border px-3 text-[15px]" />
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input inputMode="numeric" value={beds} onChange={(e) => setBeds(e.target.value.replace(/[^0-9]/g, ""))} placeholder={es ? "Pies cuadrados" : "Square feet"} className="min-h-[44px] rounded-xl border px-3 text-[15px]" />
                  <input inputMode="decimal" value={baths} onChange={(e) => setBaths(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={es ? "Baños" : "Bathrooms"} className="min-h-[44px] rounded-xl border px-3 text-[15px]" />
                </div>
              )}
              <p className="mt-2 text-[13px] text-[hsl(var(--pro-ink-soft))]">{es ? "Si no coincide con el plan, haga lo reservado. Tidy habla con el miembro." : "If it doesn't match the plan, do the visit as booked. Tidy talks to the customer \u2014 never you."}</p>
              <ProButton full className="mt-3" disabled={busy !== null} onClick={() => void saveSize()}>{es ? "Guardar tamaño y terminar" : "Save size and finish"}</ProButton>
            </ProCard>
          )}

          <Link
            to={`/pro/visit/${visit.id}/photos`}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border-2 border-[hsl(var(--pro-blue))] bg-white text-[15px] font-semibold text-[hsl(var(--pro-blue))]"
          >
            {es ? "Subir fotos" : "Upload photos"} ({visit.before_photos ?? 0} {es ? "antes" : "before"} · {visit.after_photos ?? 0} {es ? "después" : "after"})
          </Link>

          <ProButton
            full
            variant="secondary"
            disabled={!photosOk || blocked || busy !== null || !!visit.completed_at}
            onClick={() => setConfirm(true)}
          >
            {es?'Registrar salida y completar':'Check out and complete'}
          </ProButton>
          {visit.service_type==='cleaning'&&<CleaningTeamInspection visitId={visit.id}/>}
          {!photosOk && !visit.completed_at && (
            <p className="text-center text-[13px] text-[hsl(var(--pro-ink-soft))]">
              {es ? "Se requiere una foto de antes y una de después." : "One before photo and one after photo are required."}
            </p>
          )}
          <button
            type="button"
            disabled={busy !== null || blocked || !!visit.completed_at}
            onClick={() => setBlockOpen(true)}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--pro-navy)/0.12)] bg-white text-[15px] font-bold text-[hsl(var(--pro-ink-soft))] disabled:opacity-50"
          >
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--pro-amber))]" aria-hidden />
            {es ? "No puedo realizar esta visita" : "Can't work this visit"}
          </button>

          {blocked && (
            <p className="text-center text-[13px] font-semibold text-[hsl(var(--pro-amber))]">
              {es ? "Las acciones están pausadas hasta tener un certificado de seguro vigente." : "Visit actions are paused until a valid certificate of insurance is on file."}
            </p>
          )}
        </div>
      </div>

      {blockOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setBlockOpen(false)}>
          <div
            className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[18px] font-extrabold text-[hsl(var(--pro-ink))]">{es ? "¿No puede realizar esta visita?" : "Can't work this visit?"}</p>
            <p className="mt-1 text-[14px] text-[hsl(var(--pro-ink-soft))]">
              {visit.service_type==='cleaning' ? (es ? 'Sin acceso o salida por peligro: se paga la mitad. Cuéntenos qué pasó.' : 'Lockout or unsafe exit pays half the visit rate. Tell us what stopped you.') : (es ? 'Fue al lugar: se paga la visita completa. Cuéntenos qué pasó.' : "You drove out, so you're paid in full. Tell us what stopped you.")}
            </p>
            <div className="mt-4 space-y-2">
              {([
                ["customer_no_access", "Couldn't get in — locked gate or no access"],
                ["unsafe_conditions", "Unsafe to work — weather, animal or hazard"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBlockReason(value)}
                  className={`flex min-h-[52px] w-full items-center rounded-2xl border-2 px-4 text-left text-[15px] font-semibold ${
                    blockReason === value
                      ? "border-[hsl(var(--pro-blue))] bg-[hsl(var(--pro-blue)/0.06)] text-[hsl(var(--pro-ink))]"
                      : "border-[hsl(var(--pro-navy)/0.1)] bg-white text-[hsl(var(--pro-ink-soft))]"
                  }`}
                >
                  {es ? (value === "customer_no_access" ? "No pude entrar — puerta cerrada o sin acceso" : "No es seguro — clima, animal o peligro") : label}
                </button>
              ))}
            </div>
            <textarea
              value={blockNote}
              onChange={(e) => setBlockNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={es ? "¿Qué pasó? (obligatorio)" : "What happened? (required)"}
              className="mt-3 w-full rounded-2xl border border-[hsl(var(--pro-navy)/0.12)] p-3 text-[15px] text-[hsl(var(--pro-ink))]"
            />
            <ProButton
              full
              className="mt-4"
              disabled={busy === "blocked" || blockNote.trim().length < 10}
              onClick={() => void reportBlocked()}
            >
              {busy === "blocked" ? (es ? "Enviando…" : "Sending…") : (es ? "Reportar visita" : "Report visit")}
            </ProButton>
            <button
              type="button"
              onClick={() => setBlockOpen(false)}
              className="mt-2 min-h-[44px] w-full text-[14px] font-bold text-[hsl(var(--pro-ink-soft))]"
            >
              {es ? "Cancelar" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setConfirm(false)}>
          <div
            className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[18px] font-extrabold text-[hsl(var(--pro-ink))]">{es ? "¿Completar esta visita?" : "Complete this visit?"}</p>
            <ul className="mt-3 space-y-2 text-[15px] text-[hsl(var(--pro-ink))]">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[hsl(var(--pro-green))]" aria-hidden /> {es ? "Fotos agregadas" : "Photos added"}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[hsl(var(--pro-green))]" aria-hidden /> {es ? "Lista revisada" : "Checklist reviewed"}
              </li>
            </ul>
            <ProButton full className="mt-5" disabled={busy === "complete"} onClick={() => void complete()}>
              {busy === "complete" ? (es ? "Completando…" : "Completing…") : (es ? "Sí, completar visita" : "Yes, complete visit")}
            </ProButton>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="mt-2 min-h-[44px] w-full text-[14px] font-bold text-[hsl(var(--pro-ink-soft))]"
            >
              {es ? "Todavía no" : "Not yet"}
            </button>
          </div>
        </div>
      )}
    </ProShell>
  );
}
