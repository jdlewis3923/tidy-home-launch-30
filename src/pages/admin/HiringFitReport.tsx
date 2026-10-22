import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, ArrowLeft, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { answerText, hasAnswer, visibleQuestions, applicationSections, type ApplicationQuestion, type SavedAnswer } from "@/lib/applicant-answers";

type Report = { name: string; service: string; language: string; stage: string; skill: number; reliability: number; intent: number; intent_adjustments: number; phone_talking_points: { id: string; question: string }[]; inperson_talking_points: { id: string; question: string }[]; error?: string };

export default function HiringFitReport() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const t = (en: string, es: string) => language === "es" ? es : en;
  const [r, setR] = useState<Report | null>(null);
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!id) { setError("Applicant not found"); setLoading(false); return; }
    setLoading(true); setError("");
    const [report, qs, saved, pipeline] = await Promise.all([
      supabase.rpc("hiring_fit_report", { _id: id }),
      supabase.from("question_bank").select("id, key, section, sort, service, active, label_en, label_es, type, options").order("section").order("sort"),
      supabase.from("application_answers").select("question_id, value, answered_at").eq("candidate_id", id),
      supabase.from("contractor_pipeline").select("apply_submitted_at").eq("applicant_id", id).maybeSingle(),
    ]);
    const failure = report.error || qs.error || saved.error || pipeline.error;
    const data = report.data as Report | null;
    if (failure || !data || data.error) setError(failure?.message ?? data?.error ?? "Applicant not found");
    else { setR(data); setQuestions(qs.data ?? []); setAnswers(saved.data ?? []); setSubmitted(pipeline.data?.apply_submitted_at ?? null); }
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const adjust = async () => {
    const d = Number(delta);
    if (!id || !d || d < -10 || d > 10 || reason.trim().length < 5) {
      toast({ title: t("Adjustment needs −10..+10 and a reason (5+ characters)", "El ajuste debe ser de −10 a +10 y tener un motivo (5 caracteres mínimo)"), variant: "destructive" }); return;
    }
    const { error } = await supabase.from("intent_adjustments").insert({ applicant_id: id, delta: d, reason: reason.trim() });
    if (error) toast({ title: error.message, variant: "destructive" });
    else { setDelta(""); setReason(""); void load(); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !r) return <div className="container max-w-4xl py-10 space-y-4"><p role="alert" className="text-destructive">{t("Could not load applicant results", "No se pudieron cargar los resultados")}: {error}</p><Button onClick={load}>{t("Try again", "Reintentar")}</Button></div>;

  const all = visibleQuestions(questions, answers, r.service);
  const byId = new Map(answers.map(a => [a.question_id, a]));
  const answered = all.filter(q => hasAnswer(byId.get(q.id)?.value)).length;
  const shown = all.filter(q => {
    const value = byId.get(q.id)?.value;
    const done = hasAnswer(value);
    return (filter === "all" || (filter === "answered" ? done : !done)) && `${q.label_en} ${q.label_es} ${answerText(value, q, language)}`.toLowerCase().includes(search.toLowerCase());
  });
  const sections = [...new Set(shown.map(q => q.section))];
  const formatDate = (date: string) => `${new Date(date).toLocaleString(language === "es" ? "es-US" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} ET`;
  const service = r.service === "cleaning" ? t("Cleaning", "Limpieza") : r.service === "lawn" ? t("Lawn care", "Cuidado del jardín") : t("Car Care", "Cuidado del Auto");

  return <div className="container mx-auto px-4 py-6 max-w-4xl min-w-0 text-foreground">
    <Button variant="ghost" size="sm" asChild className="mb-4"><Link to={`/admin/pipeline/${id}`}><ArrowLeft className="h-4 w-4 mr-2" />{t("Candidate record", "Registro del candidato")}</Link></Button>
    <header className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="min-w-0"><p className="text-sm text-primary font-semibold mb-1">{t("Application results", "Resultados de la solicitud")}</p><h1 className="text-2xl font-bold break-words">{r.name}</h1><p className="text-sm text-muted-foreground mt-1">{service} · {r.language === "es" ? "Español" : "English"}</p></div>
      <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />{t("Refresh", "Actualizar")}</Button>
    </header>
    <section className="border-y border-border py-4 mb-6 space-y-2">
      <p className={`font-semibold ${submitted ? "text-primary" : "text-destructive"}`}>{submitted ? `${t("Submitted on jointidy.co", "Enviada en jointidy.co")} · ${formatDate(submitted)}` : t("NOT submitted on jointidy.co — saved answers only", "NO enviada en jointidy.co — solo respuestas guardadas")}</p>
      <p className="text-sm">{answered} / {all.length} {t("questions answered", "preguntas respondidas")} · {all.length - answered} {t("not answered", "sin respuesta")}</p>
    </section>
    <section aria-label={t("Questions and answers", "Preguntas y respuestas")}>
      <h2 className="text-xl font-bold mb-4">{t("Questions & their answers", "Preguntas y respuestas del candidato")}</h2>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label={t("Search questions or answers", "Buscar preguntas o respuestas")} placeholder={t("Search questions or answers", "Buscar preguntas o respuestas")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <div className="flex flex-wrap gap-1">{[["all", t("All", "Todas")], ["answered", t("Answered", "Respondidas")], ["missing", t("Unanswered", "Sin respuesta")]].map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}</div>
      </div>
      {sections.map(section => <section key={section} className="mb-8">
        <h3 className="text-base font-bold bg-muted py-3 px-4 border-l-4 border-primary">{applicationSections[language][section - 1] ?? `${t("Section", "Sección")} ${section}`}</h3>
        <dl className="divide-y divide-border">{shown.filter(q => q.section === section).map(q => {
          const saved = byId.get(q.id);
          const done = hasAnswer(saved?.value);
          return <div key={q.id} className="py-5 px-1 min-w-0" data-question-id={q.id}>
            <dt className="font-semibold text-sm leading-relaxed break-words">{all.indexOf(q) + 1}. {language === "es" ? q.label_es || q.label_en : q.label_en}</dt>
            <dd className={`mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-base ${done ? "text-foreground" : "text-muted-foreground italic"}`}>{answerText(saved?.value, q, language)}</dd>
            {!q.active && <dd className="text-xs text-muted-foreground mt-2">{t("Earlier application question · saved answer retained", "Pregunta de la solicitud anterior · respuesta conservada")}</dd>}
          </div>;
        })}</dl>
      </section>)}
      {shown.length === 0 && <p className="text-muted-foreground py-6">{t("No matching questions or answers.", "No hay preguntas ni respuestas que coincidan.")}</p>}
    </section>
    <details className="border-t border-border py-5">
      <summary className="font-semibold cursor-pointer">{t("Internal scores & interview follow-up", "Puntuaciones internas y seguimiento de la entrevista")}</summary>
      <p className="text-sm text-muted-foreground mt-4">{t("Automated indicators, not verified qualifications. Some inputs were removed from the shorter application; missing answers can distort these scores.", "Son indicadores automáticos, no cualificaciones verificadas. Algunas preguntas se eliminaron de la solicitud abreviada; las respuestas faltantes pueden distorsionar estas puntuaciones.")}</p>
      <dl className="space-y-3 mt-4 text-sm">
        <div><dt className="font-semibold">{t("Self-rated experience", "Experiencia autoevaluada")}: {r.skill}/100</dt><dd className="text-muted-foreground">{t("Weighted average of their 0–10 skill answers. Not a practical assessment.", "Promedio ponderado de sus respuestas de habilidades de 0 a 10. No es una evaluación práctica.")}</dd></div>
        <div><dt className="font-semibold">{t("Attendance & scenario indicator", "Indicador de asistencia y situaciones")}: {r.reliability}/100</dt><dd className="text-muted-foreground">{t("Starts at 100; deductions come from attendance history and scenario answers. Missing history is not proof of reliability.", "Comienza en 100 y descuenta puntos según la asistencia y las respuestas a situaciones. La falta de historial no demuestra fiabilidad.")}</dd></div>
        <div><dt className="font-semibold">{t("Application follow-through", "Seguimiento de la solicitud")}: {r.intent}/100</dt><dd className="text-muted-foreground">{t("Application, photo and booking timing, availability, motivation answers and manual adjustments. Not a personality rating.", "Tiempos de solicitud, fotos y reserva, disponibilidad, respuestas de motivación y ajustes manuales. No evalúa la personalidad.")}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-2"><Input aria-label={t("Score adjustment", "Ajuste de puntuación")} type="number" min={-10} max={10} value={delta} onChange={e => setDelta(e.target.value)} placeholder="−10..+10" className="w-28" /><Input aria-label={t("Adjustment reason", "Motivo del ajuste")} value={reason} onChange={e => setReason(e.target.value)} placeholder={t("Reason (required)", "Motivo (obligatorio)")} className="flex-1 min-w-48" /><Button onClick={adjust}>{t("Apply adjustment", "Aplicar ajuste")}</Button></div>
      {[{ title: t("Phone follow-up", "Seguimiento por teléfono"), points: r.phone_talking_points }, { title: t("In-person follow-up", "Seguimiento en persona"), points: r.inperson_talking_points }].map(group => <div key={group.title} className="mt-5"><h3 className="font-semibold">{group.title}</h3><ul className="list-disc pl-5 mt-2 space-y-2 text-sm">{group.points?.map(point => <li key={point.id}>{point.question}</li>)}</ul></div>)}
    </details>
  </div>;
}
