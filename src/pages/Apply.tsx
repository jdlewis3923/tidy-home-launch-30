/**
 * Public Application — /apply (hiring v5)
 *
 * 12-section slider application, EN/ES, autosave + resume token.
 * Questions come from the question_bank table (admin-editable).
 * Sliders stay unset until touched. Knockouts archive on submit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import TidyLogo from "@/components/TidyLogo";
import SeoHead from "@/components/landing/SeoHead";

type Q = {
  id: string; key: string; section: number; type: string; label: string; label_en?: string; label_es?: string;
  anchors: string | null; core: boolean; weight: number; required: boolean;
  options: { value: string; en: string; es: string }[] | null; knockout: boolean; sort: number;
};
type Faq = { q: string; a: string; needs_justin: boolean };
type Answers = Record<string, unknown>;

const SECTIONS_EN = ["About you", "Quick check", "Availability", "Work history", "Your skills", "How you work", "Showing up", "What would you do?", "Your equipment", "What you want", "A reference", "Review & send"];
const SECTIONS_ES = ["Sobre ti", "Chequeo rápido", "Disponibilidad", "Historial de trabajo", "Tus habilidades", "Cómo trabajas", "Puntualidad", "¿Qué harías?", "Tu equipo", "Lo que quieres", "Una referencia", "Revisar y enviar"];

const SKILL_ANCHORS = {
  en: ["Never done it", "Done it a few times", "Comfortable", "Very good", "Could teach it"],
  es: ["Nunca lo he hecho", "Lo he hecho algunas veces", "Me siento cómodo", "Muy bueno", "Podría enseñarlo"],
};
const STYLE_ANCHORS = {
  en: ["Not me", "Rarely", "Sometimes", "Usually", "Always me"],
  es: ["No soy yo", "Casi nunca", "A veces", "Casi siempre", "Siempre yo"],
};

export default function Apply() {
  const [params] = useSearchParams();
  const [token, setToken] = useState<string | null>(params.get("resume"));
  const [service, setService] = useState<string>("");
  const [lang, setLang] = useState<"en" | "es">("en");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [faq, setFaq] = useState<Faq[]>([]);
  const [section, setSection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [knockout, setKnockout] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const saveQueue = useRef<Record<string, unknown>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = useCallback((en: string, es: string) => (lang === "es" ? es : en), [lang]);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error: err } = await supabase.functions.invoke("hiring-candidate", { body: payload });
    if (err) throw err;
    return data;
  }, []);

  // Load an in-progress application.
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    call({ action: "load", token })
      .then((d) => {
        if (d?.error) { setError(d.error); return; }
        setLang(d.lang === "es" ? "es" : "en");
        setService(d.service);
        setQuestions(d.questions ?? []);
        setAnswers(d.answers ?? {});
        setFaq(d.faq ?? []);
        if (d.submitted) setSubmitted(true);
      })
      .catch(() => setError("load_failed"))
      .finally(() => setLoading(false));
  }, [token, call]);

  const start = async (svc: string) => {
    setStarting(true);
    try {
      const d = await call({ action: "start", service: svc, lang });
      if (d?.token) {
        setToken(d.token);
        window.history.replaceState(null, "", `/apply?resume=${d.token}`);
      } else setError(d?.error ?? "start_failed");
    } catch { setError("start_failed"); }
    setStarting(false);
  };

  // Autosave: debounce 800ms per question.
  const answer = useCallback((q: Q, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
    saveQueue.current[q.id] = value;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const batch = { ...saveQueue.current };
      saveQueue.current = {};
      for (const [qid, v] of Object.entries(batch)) {
        call({ action: "answer", token, question_id: qid, value: v }).catch(() => undefined);
      }
    }, 800);
  }, [call, token]);

  const submit = async () => {
    setLoading(true); setMissing([]);
    try {
      const d = await call({ action: "submit", token });
      if (d?.ok) { setSubmitted(true); setKnockout(!!d.knockout); }
      else if (d?.error === "missing") { setMissing(d.keys ?? []); setSection(1); }
      else setError(d?.error ?? "submit_failed");
    } catch { setError("submit_failed"); }
    setLoading(false);
  };

  const bySection = useMemo(() => {
    const m = new Map<number, Q[]>();
    for (const q of questions) {
      const arr = m.get(q.section) ?? [];
      arr.push(q);
      m.set(q.section, arr);
    }
    return m;
  }, [questions]);

  const sectionNames = lang === "es" ? SECTIONS_ES : SECTIONS_EN;
  const current = bySection.get(section) ?? [];
  const totalSections = Math.max(1, ...Array.from(bySection.keys()), 12);

  const renderQuestion = (q: Q) => {
    const v = answers[q.id];
    const isMissing = missing.includes(q.key);
    const wrap = (children: React.ReactNode) => (
      <div key={q.id} className={`rounded-xl border p-4 ${isMissing ? "border-destructive" : "border-border"} bg-card`}>
        <p className="font-medium text-foreground mb-3">{(lang === "es" ? q.label_es : q.label_en) ?? q.label}{q.required && q.type !== "slider" ? <span className="text-destructive"> *</span> : null}</p>
        {children}
      </div>
    );

    if (q.type === "slider") {
      const anchors = q.anchors === "style" ? STYLE_ANCHORS[lang] : SKILL_ANCHORS[lang];
      const num = typeof v === "number" ? v : null;
      return wrap(
        <div>
          <div className="flex justify-between gap-1">
            {[2, 4, 6, 8, 10].map((n, i) => (
              <button key={n} type="button" onClick={() => answer(q, n)}
                className={`flex-1 rounded-lg border py-3 text-sm font-semibold transition-colors ${num === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}>
                {n / 2}
              </button>
            ))}
          </div>
          <div className="flex justify-between gap-1 mt-1">
            {anchors.map((a, i) => (
              <span key={i} className={`flex-1 text-center text-[10px] leading-tight ${num === (i + 1) * 2 ? "text-primary font-semibold" : "text-muted-foreground"}`}>{a}</span>
            ))}
          </div>
        </div>
      );
    }
    if (q.type === "yesno") {
      return wrap(
        <div className="flex gap-2">
          {[true, false].map((b) => (
            <button key={String(b)} type="button" onClick={() => answer(q, b)}
              className={`flex-1 rounded-lg border py-3 font-semibold ${v === b ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}>
              {b ? t("Yes", "Sí") : t("No", "No")}
            </button>
          ))}
        </div>
      );
    }
    if (q.type === "choice" && q.options) {
      return wrap(
        <div className="grid gap-2">
          {q.options.map((o) => (
            <button key={o.value} type="button" onClick={() => answer(q, o.value)}
              className={`rounded-lg border px-4 py-3 text-left ${v === o.value ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-foreground"}`}>
              {lang === "es" ? o.es : o.en}
            </button>
          ))}
        </div>
      );
    }
    if (q.type === "number") {
      return wrap(<Input type="number" inputMode="numeric" value={typeof v === "number" ? String(v) : ""} onChange={(e) => answer(q, e.target.value === "" ? null : Number(e.target.value))} />);
    }
    if (q.type === "date") {
      return wrap(<Input type="date" value={typeof v === "string" ? v : ""} onChange={(e) => answer(q, e.target.value)} />);
    }
    if (q.type === "grid") {
      // Free-form grid (work history, availability blocks) — JSON text area for now.
      return wrap(<Textarea rows={4} value={typeof v === "string" ? v : ""} placeholder={t("One per line", "Uno por línea")} onChange={(e) => answer(q, e.target.value)} />);
    }
    if (q.type === "checklist") {
      return wrap(<Textarea rows={4} value={typeof v === "string" ? v : ""} placeholder={t("Item — brand — age, one per line", "Artículo — marca — antigüedad, uno por línea")} onChange={(e) => answer(q, e.target.value)} />);
    }
    return wrap(q.key.includes("why") || q.type === "text" && q.key.startsWith("intent.")
      ? <Textarea rows={3} value={typeof v === "string" ? v : ""} onChange={(e) => answer(q, e.target.value)} />
      : <Input value={typeof v === "string" ? v : ""} onChange={(e) => answer(q, e.target.value)} />);
  };

  // ---- screens
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <CheckCircle2 className="h-14 w-14 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">{knockout ? t("Thanks for your time", "Gracias por tu tiempo") : t("Application received", "Solicitud recibida")}</h1>
          <p className="text-muted-foreground">{knockout
            ? t("This role needs a few things you don't have right now. If that changes, apply again — we'd love to hear from you.", "Este puesto requiere algunas cosas que no tienes ahora. Si eso cambia, aplica de nuevo — nos encantaría saber de ti.")
            : t("Next step: show us your equipment. We'll text you a link — it takes about 10 minutes on your phone.", "Siguiente paso: muéstranos tu equipo. Te enviaremos un enlace por texto — toma unos 10 minutos desde tu teléfono.")}</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background">
        <SeoHead title={t("Apply to be a Tidy Pro", "Aplica para ser un Pro de Tidy")} description={t("Join Tidy's pro team in Miami.", "Únete al equipo de Pros de Tidy en Miami.")} canonical="/apply" />
        <header className="border-b border-border"><div className="container mx-auto px-4 py-4 flex items-center justify-between"><Link to="/"><TidyLogo /></Link>
          <button onClick={() => setLang(lang === "en" ? "es" : "en")} className="text-sm font-semibold text-foreground">{lang === "en" ? "Español" : "English"}</button></div></header>
        <main className="container mx-auto px-4 py-12 max-w-xl">
          <div className="flex items-center gap-2 text-primary mb-3"><Sparkles className="h-5 w-5" /><span className="text-sm font-semibold uppercase tracking-wide">{t("Now hiring", "Estamos contratando")}</span></div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{t("Work for yourself, with a route we build for you", "Trabaja por tu cuenta, con una ruta que construimos para ti")}</h1>
          <p className="text-muted-foreground mb-8">{t("Pick your service to start. About 10 minutes, and you can finish later — we save as you go.", "Elige tu servicio para empezar. Unos 10 minutos, y puedes terminar después — guardamos a medida que avanzas.")}</p>
          <div className="grid gap-3">
            {([["cleaning", t("Home cleaning", "Limpieza de casas")], ["lawn", t("Lawn care", "Cuidado de césped")], ["car_care", t("Car care", "Cuidado de autos")]] as const).map(([svc, label]) => (
              <Button key={svc} size="lg" variant="outline" disabled={starting} onClick={() => start(svc)} className="justify-between h-14 text-base">
                {label}{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              </Button>
            ))}
          </div>
          {error ? <p className="text-destructive text-sm mt-4">{error}</p> : null}
        </main>
      </div>
    );
  }

  if (loading && questions.length === 0) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet><title>{t("Apply — Tidy", "Aplica — Tidy")}</title></Helmet>
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <TidyLogo />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{t("Saved as you go", "Se guarda a medida que avanzas")}</span>
            <button onClick={() => setLang(lang === "en" ? "es" : "en")} className="text-sm font-semibold text-foreground">{lang === "en" ? "Español" : "English"}</button>
          </div>
        </div>
        <div className="h-1 bg-muted"><div className="h-1 bg-primary transition-all" style={{ width: `${(section / totalSections) * 100}%` }} /></div>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">{t("Section", "Sección")} {section} {t("of", "de")} {totalSections}</p>
        <h2 className="text-2xl font-bold text-foreground mb-6">{sectionNames[section - 1] ?? ""}</h2>
        <div className="grid gap-4">{current.map(renderQuestion)}</div>
        {missing.length > 0 ? <p className="text-destructive text-sm mt-4">{t("Some required answers are missing — they're marked in red.", "Faltan algunas respuestas obligatorias — están marcadas en rojo.")}</p> : null}
        {error ? <p className="text-destructive text-sm mt-4">{error}</p> : null}
        <div className="flex gap-3 mt-8">
          <Button variant="outline" disabled={section <= 1} onClick={() => setSection((s) => s - 1)}><ArrowLeft className="h-4 w-4 mr-1" />{t("Back", "Atrás")}</Button>
          {section < totalSections
            ? <Button className="flex-1" onClick={() => setSection((s) => s + 1)}>{t("Next", "Siguiente")}<ArrowRight className="h-4 w-4 ml-1" /></Button>
            : <Button className="flex-1" disabled={loading} onClick={submit}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Send my application", "Enviar mi solicitud")}</Button>}
        </div>
        {faq.length > 0 && section === totalSections ? (
          <div className="mt-10 border-t border-border pt-6">
            <h3 className="font-semibold text-foreground mb-3">{t("Questions candidates ask", "Preguntas frecuentes")}</h3>
            <div className="grid gap-3">
              {faq.map((f, i) => (
                <details key={i} className="rounded-lg border border-border bg-card p-3">
                  <summary className="font-medium text-foreground cursor-pointer">{f.q}</summary>
                  <p className="text-sm text-muted-foreground mt-2">{f.needs_justin ? t("We'll confirm this with you directly.", "Te lo confirmamos directamente.") : f.a}</p>
                </details>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
