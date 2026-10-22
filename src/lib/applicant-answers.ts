import type { Json } from "@/integrations/supabase/types";

export type ApplicationQuestion = {
  id: string; key: string; section: number; sort: number; service: string;
  active: boolean; label_en: string; label_es: string; type: string; options: Json | null; application_version?: number;
};
export type SavedAnswer = { question_id: string; value: Json; answered_at: string };

export function hasAnswer(value: Json | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAnswer);
  if (typeof value === "object") return Object.values(value).some(hasAnswer);
  return true;
}

export function answerText(value: Json | undefined, question: ApplicationQuestion, lang: "en" | "es"): string {
  if (question.key.startsWith('v6.equipment.') && Array.isArray(value) && value.length === 0) return lang === 'es' ? 'Todavía no tengo ninguno' : 'None of these yet';
  if (!hasAnswer(value)) return lang === "es" ? "Sin respuesta" : "Not answered";
  if (typeof value === "boolean") return value ? (lang === "es" ? "Sí" : "Yes") : "No";
  if (Array.isArray(value)) return value.map(v => answerText(v, question, lang)).join("\n");
  if (typeof value === "object" && value !== null) {
    const labels: Record<string, string> = lang === 'es' ? {title:'Puesto',company:'Empresa',duration:'Duración'} : {title:'Job title',company:'Company',duration:'Duration'};
    return Object.entries(value).map(([key, v]) => `${labels[key] ?? key.replace(/_/g, " ")}: ${answerText(v, question, lang)}`).join("\n");
  }
  if (question.key === 'v6.avail.grid') {
    const match = String(value).match(/^(Mon|Tue|Wed|Thu|Fri)_(morning|afternoon)$/);
    if (match) {
      const days: Record<string,string> = lang === 'es' ? {Mon:'Lunes',Tue:'Martes',Wed:'Miércoles',Thu:'Jueves',Fri:'Viernes'} : {Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday'};
      return `${days[match[1]]} · ${match[2] === 'morning' ? (lang === 'es' ? 'Mañana 8–12' : 'Morning 8–12') : (lang === 'es' ? 'Tarde 12–4' : 'Afternoon 12–4')}`;
    }
  }
  if (Array.isArray(question.options)) {
    const option = question.options.find(o => o && typeof o === "object" && !Array.isArray(o) && String(o.value) === String(value));
    if (option && typeof option === "object" && !Array.isArray(option)) {
      const label = option[lang] ?? option.en;
      if (typeof label === "string") return label;
    }
  }
  return question.type === "slider" ? `${value} / 10` : String(value);
}
export function questionHasAnswer(question: ApplicationQuestion, value: Json | undefined): boolean {
  return (question.key.startsWith('v6.equipment.') && question.key !== 'v6.equipment.ready' && Array.isArray(value)) || hasAnswer(value);
}

export function visibleQuestions(questions: ApplicationQuestion[], answers: SavedAnswer[], service: string) {
  const saved = new Set(answers.filter(a => hasAnswer(a.value)).map(a => a.question_id));
  return questions.filter(q => (q.active && (q.service === service || q.service === "all")) || saved.has(q.id))
    .sort((a, b) => a.section - b.section || a.sort - b.sort);
}

export const applicationSections = {
  en: ["About you", "Quick check", "Availability", "Work history", "Your skills", "How you work", "Showing up", "What would you do?", "Your equipment", "What you want", "A reference", "Review & send"],
  es: ["Sobre ti", "Chequeo rápido", "Disponibilidad", "Historial de trabajo", "Tus habilidades", "Cómo trabajas", "Puntualidad", "¿Qué harías?", "Tu equipo", "Lo que quieres", "Una referencia", "Revisar y enviar"],
};