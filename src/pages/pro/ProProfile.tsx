/**
 * Profile — /pro/profile
 * Insurance certificate upload (the one thing that unblocks visit actions),
 * account details and sign out.
 */
import LanguagePreference from "@/components/LanguagePreference";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, Camera, Car, ChevronRight, CircleHelp, CreditCard, FileUp, Globe, LogOut, ShieldCheck, User, ArrowLeft, Check } from "lucide-react";
import { Link } from "react-router-dom";
import LanguageSheet from "@/components/pro/portal/LanguageSheet";
import { useLanguage } from "@/contexts/LanguageContext";
import ProShell from "@/components/pro/portal/ProShell";
import { ProButton, ScheduleSkeleton, SettingRow, StatusPill } from "@/components/pro/portal/kit";
import PushOptIn from "@/components/pro/portal/PushOptIn";
import ShotList from "@/components/pro/ShotList";
import { SHOT_LIST } from "@/lib/visitShotList";
import { useProSession } from "@/hooks/useProSession";
import { supabase } from "@/integrations/supabase/client";

export default function ProProfile() {
  const navigate = useNavigate();
  const { me, coi, isOwner, userId, loading, reload } = useProSession();
  const [carrier, setCarrier] = useState("");
  const [policy, setPolicy] = useState("");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { language } = useLanguage();
  const es = language === "es";
  const reduce = useReducedMotion();
  const [panel, setPanel] = useState<string | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;

  const submitCoi = async () => {
    if (!file || !userId || !me?.pro_id) return;
    setBusy(true);
    setMsg(null);
    try {
      const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
      const path = `${userId}/coi-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("contractor-coi-pdfs").upload(path, file);
      if (up.error) throw up.error;
      const { error } = await supabase.from("contractor_insurance").insert({
        applicant_id: me.pro_id,
        contractor_id: userId,
        carrier_name: carrier || null,
        policy_number: policy || null,
        expiration_date: expires || null,
        certificate_path: path,
        certificate_mime: file.type || null,
      });
      if (error) throw error;
      setMsg({ tone: "ok", text: "Certificate uploaded. Tidy reviews it and your status updates here." });
      setFile(null);
      setCarrier("");
      setPolicy("");
      setExpires("");
      reload();
    } catch {
      setMsg({
        tone: "bad",
        text: "That upload didn't go through. Email hello@jointidy.co and we'll take it directly.",
      });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/pro/welcome", { replace: true });
  };

  const tier2 = me?.tier === "tier_2_pro" || me?.tier === "tier_2";
  const initials = (me?.first_name ?? "T").slice(0, 1).toUpperCase();
  const coiLabel: Record<string, [string, string]> = { none: ["Missing", "Falta"], under_review: ["Under review", "En revisión"], active: ["Active", "Activo"], expiring: ["Expiring", "Por vencer"], expired: ["Expired", "Vencido"] };
  const input = "mt-1 min-h-[48px] w-full rounded-xl border border-[hsl(var(--pro-line))] bg-white px-4 text-[16px]";
  const rows: { key: string; label: string; Icon: typeof User; trail?: React.ReactNode }[] = [
    { key: "personal", label: es ? "Información personal" : "Personal Information", Icon: User },
    { key: "vehicle", label: es ? "Vehículo y documentos" : "Vehicle & Documents", Icon: Car },
    { key: "insurance", label: es ? "Seguro" : "Insurance", Icon: ShieldCheck, trail: <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${coi?.can_work ? "bg-[hsl(var(--pro-green-soft))] text-[hsl(var(--pro-green))]" : "bg-[hsl(var(--pro-amber-soft))] text-[hsl(var(--pro-amber))]"}`}>{(coiLabel[coi?.status ?? "none"] ?? coiLabel.none)[es ? 1 : 0]}</span> },
    { key: "payment", label: es ? "Método de pago" : "Payment Method", Icon: CreditCard },
    { key: "language", label: es ? "Idioma" : "Language", Icon: Globe, trail: <span className="text-[12px] text-[hsl(var(--pro-ink-soft))]">{es ? "Español" : "English"}</span> },
    { key: "notifications", label: es ? "Notificaciones" : "Notifications", Icon: Bell },
    { key: "help", label: es ? "Ayuda y soporte" : "Help & Support", Icon: CircleHelp },
  ];
  const visibleRows = isOwner ? rows.filter((r) => r.key !== "insurance") : rows;
  const title = rows.find((r) => r.key === panel)?.label ?? "";

  const panelBody = () => {
    switch (panel) {
      case "personal": return (<div className="space-y-1 text-[14px] text-[hsl(var(--pro-ink))]"><p className="font-semibold">{me?.first_name ?? "Tidy Pro"}</p><p className="text-[hsl(var(--pro-ink-soft))]">{me?.pro_number ?? "—"}</p><p className="pt-2 text-[12.5px] text-[hsl(var(--pro-ink-soft))]">{es ? "Para cambiar sus datos, envíe un mensaje a Tidy." : "To change your details, message Tidy."}</p><Link to="/pro/messages" className="inline-block pt-2 font-medium text-[hsl(var(--pro-blue))]">{es ? "Mensaje a Tidy" : "Message Tidy"}</Link></div>);
      case "vehicle": return (<div className="overflow-hidden rounded-[12px] border border-[hsl(var(--pro-line))]"><SettingRow to="/pro/equipment" label={es ? "Equipo" : "Equipment"} /><SettingRow to="/pro/orientation" label={es ? "Orientación Pro" : "Pro orientation"} />{!isOwner && <SettingRow to="/pro/upload-coi" label={es ? "Certificado de seguro" : "Insurance certificate"} />}</div>);
      case "payment": return (<p className="text-[13.5px] text-[hsl(var(--pro-ink-soft))]">{es ? "Sus pagos se configuran con Tidy. Para cambiar su método de pago, envíe un mensaje a Tidy." : "Your payouts are set up with Tidy. To change your payout method, message Tidy."} <Link to="/pro/messages" className="font-medium text-[hsl(var(--pro-blue))]">{es ? "Mensaje a Tidy" : "Message Tidy"}</Link></p>);
      case "notifications": return (<div className="space-y-3"><PushOptIn /><div className="overflow-hidden rounded-[12px] border border-[hsl(var(--pro-line))]"><SettingRow to="/pro/notifications" label={es ? "Ver notificaciones" : "View notifications"} /></div></div>);
      case "help": return (<div className="space-y-3"><div className="overflow-hidden rounded-[12px] border border-[hsl(var(--pro-line))]"><SettingRow to="/pro/messages" label={es ? "Mensaje a Tidy" : "Message Tidy"} /><SettingRow to="/pro/orientation" label={es ? "Orientación Pro" : "Pro orientation"} /><SettingRow label={es ? "Contactar soporte" : "Contact support"} onClick={() => { window.location.href = "mailto:hello@jointidy.co"; }} /></div><p className="text-[12px] font-semibold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">{es ? "Guía de fotos" : "Photo guide"}</p>{Object.values(SHOT_LIST).map((s) => <ShotList key={s.label} label={s.label} shots={s.shots} />)}<LanguagePreference /></div>);
      case "insurance": return (
        <div>
          <div className="flex items-center justify-between"><p className="text-[14px] font-semibold text-[hsl(var(--pro-ink))]">{es ? "Certificado de seguro" : "Certificate of insurance"}</p><StatusPill tone={coi?.can_work ? "green" : "amber"}>{(coiLabel[coi?.status ?? "none"] ?? coiLabel.none)[es ? 1 : 0]}</StatusPill></div>
          <p className="mt-1 text-[13px] text-[hsl(var(--pro-ink-soft))]">{coi?.can_work ? (es ? "Certificado válido registrado. Suba uno nuevo antes de que venza." : "Valid certificate on file. Upload a new one before it expires.") : (es ? "Se requiere un certificado válido para comenzar o completar una visita." : "A valid certificate is required before you can start or complete a visit.")}</p>
          <div className="mt-4 space-y-3">
            <label className="block"><span className="text-[13px] font-semibold text-[hsl(var(--pro-ink))]">{es ? "Aseguradora" : "Carrier"}</span><input value={carrier} onChange={(e) => setCarrier(e.target.value)} className={input} /></label>
            <label className="block"><span className="text-[13px] font-semibold text-[hsl(var(--pro-ink))]">{es ? "Número de póliza" : "Policy number"}</span><input value={policy} onChange={(e) => setPolicy(e.target.value)} className={input} /></label>
            <label className="block"><span className="text-[13px] font-semibold text-[hsl(var(--pro-ink))]">{es ? "Vence" : "Expires"}</span><input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={input} /></label>
            <label className="flex min-h-[52px] cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-[hsl(var(--pro-sky)/0.7)] bg-white px-4 text-[14px] font-semibold text-[hsl(var(--pro-blue))]"><FileUp className="h-5 w-5" aria-hidden />{file ? file.name : (es ? "Elegir certificado (PDF o foto)" : "Choose certificate (PDF or photo)")}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
            <ProButton full disabled={!file || busy} onClick={() => void submitCoi()}>{busy ? (es ? "Subiendo…" : "Uploading…") : (es ? "Subir certificado" : "Upload certificate")}</ProButton>
            {msg && <p className={`rounded-xl p-3 text-[13px] font-semibold ${msg.tone === "ok" ? "bg-[hsl(var(--pro-green-soft))] text-[hsl(var(--pro-green))]" : "bg-[hsl(var(--pro-red-soft))] text-[hsl(var(--pro-red))]"}`}>{msg.tone === "ok" ? (es ? "Certificado subido. Tidy lo revisa y su estado se actualiza aquí." : msg.text) : (es ? "La subida no funcionó. Escriba a hello@jointidy.co y lo recibimos directamente." : msg.text)}</p>}
          </div>
        </div>);
      default: return null;
    }
  };

  return (
    <ProShell title={es ? "Perfil" : "Profile"} back="" showBell dark>
      {loading && <ScheduleSkeleton />}
      {!loading && (
        <div className="relative overflow-hidden px-2.5 pb-4 pt-1">
          <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="rounded-[14px] bg-white">
            <div className="flex flex-col items-center px-4 pb-4 pt-5">
              <div className="relative">
                <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-[hsl(var(--pro-blue-soft))] text-[28px] font-semibold text-[hsl(var(--pro-blue))]">{initials}</div>
                <span aria-hidden className="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full bg-[hsl(var(--pro-navy))] text-primary-foreground ring-2 ring-white"><Camera className="h-3 w-3" /></span>
              </div>
              <p className="mt-2.5 text-[18px] font-semibold text-[hsl(var(--pro-ink))]">{me?.first_name ?? "Tidy Pro"}</p>
              <p className="text-[12px] text-[hsl(var(--pro-ink-soft))]">{me?.pro_number ?? "—"} · {tier2 ? (es ? "Nivel 2" : "Tier 2") : (es ? "Nivel 1" : "Tier 1")}</p>
              <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${me?.badge_status === "active" ? "bg-[hsl(var(--pro-green))] text-primary-foreground" : "bg-[hsl(var(--pro-line))] text-[hsl(var(--pro-ink-soft))]"}`}>{me?.badge_status === "active" && <Check className="h-3 w-3" aria-hidden />}{me?.badge_status === "active" ? (es ? "Activo" : "Active") : (es ? "Pendiente" : "Pending")}</span>
            </div>
            <ul>
              {visibleRows.map(({ key, label, Icon, trail }) => (
                <li key={key}>
                  <button type="button" onClick={() => key === "language" ? setLangOpen(true) : setPanel(key)} className="flex min-h-[46px] w-full items-center gap-3 border-t border-[hsl(var(--pro-line))] px-4 text-left active:bg-[hsl(var(--pro-ground))]">
                    <Icon className="h-[18px] w-[18px] text-[hsl(var(--pro-ink-soft))]" aria-hidden />
                    <span className="flex-1 text-[13.5px] text-[hsl(var(--pro-ink))]">{label}</span>{trail}
                    <ChevronRight className="h-4 w-4 text-[hsl(var(--pro-ink-soft))]" aria-hidden />
                  </button>
                </li>
              ))}
              <li><button type="button" onClick={() => void signOut()} className="flex min-h-[50px] w-full items-center gap-3 border-t border-[hsl(var(--pro-line))] px-4 text-[13.5px] text-[hsl(var(--pro-red))]"><LogOut className="h-[18px] w-[18px]" aria-hidden />{es ? "Cerrar sesión" : "Log Out"}</button></li>
            </ul>
          </motion.div>

          <AnimatePresence>
            {panel && (
              <motion.section key={panel} initial={reduce ? { opacity: 0 } : { x: "100%" }} animate={reduce ? { opacity: 1 } : { x: 0 }} exit={reduce ? { opacity: 0 } : { x: "100%" }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                className="absolute inset-x-2.5 top-1 min-h-full rounded-[14px] bg-white p-4" aria-label={title}>
                <button type="button" onClick={() => setPanel(null)} className="mb-3 inline-flex min-h-[40px] items-center gap-2 text-[15px] font-semibold text-[hsl(var(--pro-ink))]"><ArrowLeft className="h-4 w-4" aria-hidden />{title}</button>
                {panelBody()}
              </motion.section>
            )}
          </AnimatePresence>
          <LanguageSheet open={langOpen} onClose={() => setLangOpen(false)} />
        </div>
      )}
    </ProShell>
  );
}
