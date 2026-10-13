/**
 * /pro/proof/:token — Equipment Proof (no login, private uploads, signed URLs only).
 * Mobile-first, EN/ES. Never shows the business street address.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Lang = "en" | "es";
type Slot = { slot: string; kind: "photo" | "video" | "vehicle" | "work"; label_en: string; label_es: string; status: string | null; reject_reason: string | null; reject_note: string | null; editable: boolean };
type Data = { first_name: string; service: string; lang: Lang; experience_level: string | null; submitted: boolean; reopened: boolean; slots: Slot[];
  reference: { name: string | null; phone: string | null; relationship: string | null; given: boolean }; reference_editable: boolean };

const T = {
  en: {
    title: "Show us your equipment", hi: (n: string) => `Hi ${n}`, intro: "About 10 minutes on your phone. Nothing to sign yet.",
    card: "In every photo, hold a handwritten card that says:", why: "So we know it's your equipment, photographed this week.",
    a: "A. One photo of each item", b: "B. A 10-second video of each powered item running", c: "C. Your vehicle with the equipment loaded", cLawn: "C. Your vehicle with the equipment loaded, or the trailer hitched",
    plate: "Your plate does not need to show.", d: "D. Your work", dHelp: "Either 3 photos of jobs you did yourself (before and after if you have them), OR one reference: someone who paid you for this kind of work.",
    dNone: "Because you're new to this work, a reference is required.", family: "Family members are not accepted.",
    take: "Take photo", record: "Record video (max 15 s)", retake: "Replace", done: "Added", approved: "Approved", rejected: "Needs a new one",
    refName: "Reference full name", refPhone: "Reference phone", refRel: "How they know your work", relOpts: ["Past customer", "Employer or supervisor", "Other (not family)"],
    notFamily: "This person is not a family member.", submit: "Submit", submitting: "Sending…", missing: (n: number) => `${n} still needed before you can submit.`,
    thanks: "Thanks! Justin will review your equipment and text you.", reopenedTitle: "Only the items below need a new photo or video.",
    tooLong: "That video is longer than 15 seconds.", tooBig: "That file is over 60 MB.", expired: "This link has expired. Text Justin for a new one.", closed: "This link is no longer active.", uploading: "Uploading…",
    errFamily: "Family members can't be references.", errRef: "Fill in the reference's name, phone and relationship.", err: "Something went wrong. Try again.",
    today: "TIDY", vehicle: "Vehicle", work: "Job photo",
  },
  es: {
    title: "Muéstranos tu equipo", hi: (n: string) => `Hola ${n}`, intro: "Unos 10 minutos desde tu teléfono. Todavía no hay nada que firmar.",
    card: "En cada foto, sostén una tarjeta escrita a mano que diga:", why: "Así sabemos que el equipo es tuyo y que la foto es de esta semana.",
    a: "A. Una foto de cada equipo", b: "B. Un video de 10 segundos de cada equipo con motor funcionando", c: "C. Tu vehículo con el equipo cargado", cLawn: "C. Tu vehículo con el equipo cargado o con el tráiler enganchado",
    plate: "No es necesario que se vea la placa.", d: "D. Tu trabajo", dHelp: "Puede ser 3 fotos de trabajos que hiciste tú (antes y después si las tienes), O una referencia: alguien que te haya pagado por este tipo de trabajo.",
    dNone: "Como eres nuevo en este trabajo, la referencia es obligatoria.", family: "No se aceptan familiares.",
    take: "Tomar foto", record: "Grabar video (máx. 15 s)", retake: "Reemplazar", done: "Listo", approved: "Aprobado", rejected: "Necesitamos otra",
    refName: "Nombre completo de la referencia", refPhone: "Teléfono de la referencia", refRel: "Cómo conoce tu trabajo", relOpts: ["Cliente anterior", "Empleador o supervisor", "Otro (no familiar)"],
    notFamily: "Esta persona no es familiar mío.", submit: "Enviar", submitting: "Enviando…", missing: (n: number) => `Faltan ${n} para poder enviar.`,
    thanks: "¡Gracias! Justin revisará tu equipo y te enviará un mensaje.", reopenedTitle: "Solo los puntos de abajo necesitan una foto o video nuevo.",
    tooLong: "Ese video dura más de 15 segundos.", tooBig: "Ese archivo pesa más de 60 MB.", expired: "Este enlace venció. Escríbele a Justin para pedir uno nuevo.", closed: "Este enlace ya no está activo.", uploading: "Subiendo…",
    errFamily: "Un familiar no puede ser referencia.", errRef: "Escribe el nombre, teléfono y relación de la referencia.", err: "Algo salió mal. Inténtalo de nuevo.",
    today: "TIDY", vehicle: "Vehículo", work: "Foto de trabajo",
  },
} as const;

const REASON_ES: Record<string, string> = {
  "Card not in photo": "La tarjeta no aparece en la foto", "Not the required item": "No es el equipo requerido",
  "Not running / couldn't tell it works": "No está funcionando / no se ve que funcione", "Blurry": "La foto está borrosa", "Other": "Otro motivo",
};

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("pro-proof", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const j = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    return { ok: false, error: j?.error ?? "error", ...(j ?? {}) };
  }
  return data;
};

const videoSeconds = (file: File) => new Promise<number>((resolve) => {
  const v = document.createElement("video"); v.preload = "metadata";
  v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration || 0); };
  v.onerror = () => resolve(0);
  v.src = URL.createObjectURL(file);
});

export default function ProProof() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ref, setRef] = useState({ name: "", phone: "", relationship: "", not_family: false });
  const t = T[lang];

  const load = useCallback(async (first = false) => {
    const r = await call({ token, action: "load" });
    if (!r?.ok) { setFatal(r?.error === "expired" ? "expired" : "closed"); return; }
    setData(r as Data);
    if (first) {
      setLang((r as Data).lang);
      const g = (r as Data).reference;
      if (g.given) setRef({ name: g.name ?? "", phone: g.phone ?? "", relationship: g.relationship ?? "", not_family: true });
    }
  }, [token]);
  useEffect(() => { void load(true); }, [load]);

  const today = useMemo(() => new Date().toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "numeric", day: "numeric", year: "numeric" }), [lang]);

  const upload = async (s: Slot, file: File) => {
    setMsg(null);
    if (file.size > 60 * 1024 * 1024) { setMsg(t.tooBig); return; }
    let duration = 0;
    if (s.kind === "video") { duration = await videoSeconds(file); if (duration > 15.5) { setMsg(t.tooLong); return; } }
    setBusy(s.slot);
    const u = await call({ token, action: "upload_url", slot: s.slot, mime: file.type || (s.kind === "video" ? "video/mp4" : "image/jpeg"), size: file.size, duration });
    if (!u?.ok) { setBusy(null); setMsg(u?.error === "too_long" ? t.tooLong : u?.error === "too_large" ? t.tooBig : t.err); return; }
    const up = await supabase.storage.from("pipeline-proof").uploadToSignedUrl(u.path, u.token, file, { contentType: file.type || undefined });
    if (up.error) { setBusy(null); setMsg(t.err); return; }
    const c = await call({ token, action: "confirm", slot: s.slot, path: u.path });
    setBusy(null);
    if (!c?.ok) { setMsg(t.err); return; }
    await load();
  };

  if (fatal) return <Shell lang={lang} setLang={setLang} title={t.title}><p className="text-base">{fatal === "expired" ? t.expired : t.closed}</p></Shell>;
  if (!data) return <Shell lang={lang} setLang={setLang} title={t.title}><p className="text-sm text-muted-foreground">…</p></Shell>;

  const shown = data.reopened ? data.slots.filter((s) => s.editable) : data.slots;
  const req = data.slots.filter((s) => s.kind !== "work");
  const workCount = data.slots.filter((s) => s.kind === "work" && s.status && s.status !== "rejected").length;
  const reqMissing = req.filter((s) => !s.status || s.status === "rejected").length;
  const refFilled = ref.name.trim().length >= 2 && ref.phone.replace(/\D/g, "").length >= 10 && ref.relationship.trim().length >= 3 && ref.not_family;
  const refOk = refFilled || (data.reference.given && !data.reference_editable);
  const workOk = data.experience_level === "none" ? refOk : (workCount >= 3 || refOk);
  const missingCount = reqMissing + (workOk ? 0 : 1);
  const canSubmit = missingCount === 0 && !busy && (!data.submitted || data.reopened || data.reference_editable);

  const submit = async () => {
    setBusy("submit"); setMsg(null);
    const r = await call({ token, action: "submit", reference: refFilled && data.reference_editable ? ref : undefined });
    setBusy(null);
    if (!r?.ok) { setMsg(r?.error === "reference_family" ? t.errFamily : r?.error === "reference_incomplete" ? t.errRef : t.err); return; }
    setDone(true);
  };
  if (done) return <Shell lang={lang} setLang={setLang} title={t.title}><p className="text-lg font-bold">{t.thanks}</p></Shell>;

  const section = (kind: Slot["kind"][], title: string, help?: string) => {
    const list = shown.filter((s) => kind.includes(s.kind));
    if (!list.length) return null;
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-black">{title}</h2>
        {help && <p className="text-sm text-muted-foreground">{help}</p>}
        <ul className="space-y-3">{list.map((s) => (
          <li key={s.slot} className="rounded-xl border border-border bg-card p-3">
            <p className="font-semibold">{s.kind === "vehicle" ? t.vehicle : s.kind === "work" ? `${t.work} ${s.slot.split(":")[1]}` : lang === "es" ? s.label_es : s.label_en}</p>
            {s.status === "rejected" && <p className="mt-1 text-sm font-semibold text-destructive">{t.rejected}: {lang === "es" ? REASON_ES[s.reject_reason ?? ""] ?? s.reject_reason : s.reject_reason}{s.reject_note ? ` — ${s.reject_note}` : ""}</p>}
            {s.status === "approved" && <p className="mt-1 text-sm font-semibold text-primary">✓ {t.approved}</p>}
            {s.status === "pending" && <p className="mt-1 text-sm font-semibold text-primary">✓ {t.done}</p>}
            {s.editable && (
              <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">
                {busy === s.slot ? t.uploading : s.status === "pending" ? t.retake : s.kind === "video" ? t.record : t.take}
                <input type="file" className="sr-only" disabled={!!busy}
                  accept={s.kind === "video" ? "video/*" : "image/*"} capture="environment"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(s, f); e.target.value = ""; }} />
              </label>
            )}
          </li>))}</ul>
      </section>
    );
  };

  return (
    <Shell lang={lang} setLang={setLang} title={t.title}>
      <p className="text-xl font-black">{t.hi(data.first_name)}</p>
      <p className="text-sm text-muted-foreground">{data.reopened ? t.reopenedTitle : t.intro}</p>
      <div className="rounded-xl border border-border bg-muted p-3">
        <p className="text-sm font-semibold">{t.card}</p>
        <div className="mx-auto my-3 w-56 -rotate-2 rounded-md border-2 border-dashed border-foreground/40 bg-card px-4 py-3 text-center font-black leading-tight shadow-sm" aria-label="Example card">
          <span className="block text-2xl tracking-widest">{t.today}</span>
          <span className="block text-lg">{today}</span>
          <span className="block text-lg">{data.first_name || "Name"}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t.why}</p>
      </div>
      {section(["photo"], t.a)}
      {section(["video"], t.b)}
      {section(["vehicle"], data.service === "lawn" ? t.cLawn : t.c, t.plate)}
      {(!data.reopened || data.reference_editable) && (
        <section className="space-y-3">
          <h2 className="text-lg font-black">{t.d}</h2>
          <p className="text-sm text-muted-foreground">{t.dHelp}</p>
          {data.experience_level === "none" && <p className="text-sm font-semibold">{t.dNone}</p>}
          <p className="text-sm font-semibold">{t.family}</p>
          {data.experience_level !== "none" && section(["work"], "")}
          {data.reference_editable && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              <Input placeholder={t.refName} value={ref.name} onChange={(e) => setRef({ ...ref, name: e.target.value })} aria-label={t.refName} />
              <Input placeholder={t.refPhone} inputMode="tel" value={ref.phone} onChange={(e) => setRef({ ...ref, phone: e.target.value })} aria-label={t.refPhone} />
              <select aria-label={t.refRel} value={ref.relationship} onChange={(e) => setRef({ ...ref, relationship: e.target.value })} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t.refRel}</option>
                {t.relOpts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ref.not_family} onChange={(e) => setRef({ ...ref, not_family: e.target.checked })} />{t.notFamily}</label>
            </div>
          )}
        </section>
      )}
      {msg && <p className="text-sm font-semibold text-destructive">{msg}</p>}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background p-4">
        {missingCount > 0 && <p className="mb-2 text-center text-sm text-muted-foreground">{t.missing(missingCount)}</p>}
        <Button className="h-12 w-full text-base font-black" disabled={!canSubmit} onClick={() => void submit()}>{busy === "submit" ? t.submitting : t.submit}</Button>
      </div>
    </Shell>
  );
}

function Shell({ lang, setLang, title, children }: { lang: Lang; setLang: (l: Lang) => void; title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Helmet><title>{title} | Tidy</title><meta name="robots" content="noindex" /></Helmet>
      <header className="bg-navy px-4 py-4 text-primary-foreground">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <span className="text-xl font-black tracking-tight">Tidy</span>
          <div className="flex rounded-full border border-primary-foreground/40 p-0.5" role="group" aria-label="Language">
            {(["en", "es"] as const).map((l) => (
              <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1 text-xs font-bold ${lang === l ? "bg-primary-foreground text-navy" : ""}`}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <h1 className="mx-auto mt-3 max-w-md text-2xl font-black">{title}</h1>
      </header>
      <div className="mx-auto max-w-md space-y-6 px-4 py-5">{children}</div>
    </main>
  );
}
