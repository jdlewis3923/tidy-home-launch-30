/**
 * Applicant text templates. Nothing here sends anything — these strings are
 * only ever handed to an sms: link that Justin taps on his own phone.
 */
import type { HiringService } from "./score";

const SERVICE_EN: Record<string, string> = {
  cleaning: "house cleaning",
  lawn: "lawn care",
  car_care: "car care",
  ops_coordinator: "operations coordinator",
};

const SERVICE_ES: Record<string, string> = {
  cleaning: "limpieza de casas",
  lawn: "cuidado de césped",
  car_care: "lavado de autos",
  ops_coordinator: "coordinación de operaciones",
};

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}

/** Text 1 — the opening outreach. */
export function text1(name: string | null, service: HiringService | string | null): string {
  const first = firstName(name);
  const en = SERVICE_EN[service ?? ""] ?? "our opening";
  const es = SERVICE_ES[service ?? ""] ?? "nuestra vacante";
  return (
    `Hi ${first}, this is Justin with Tidy Home Concierge. You applied on Indeed for our ${en} ` +
    `opening in Pinecrest and Kendall. Pay is per job, every Friday. Do you have 10 minutes for a ` +
    `call this week? / Hola ${first}, soy Justin de Tidy Home Concierge. Usted aplicó en Indeed para ` +
    `${es} en Pinecrest y Kendall. Se paga por trabajo, cada viernes. ¿Tiene 10 minutos para una ` +
    `llamada esta semana?`
  );
}

/** Text 2 — the follow-up. */
export function text2(name: string | null): string {
  const first = firstName(name);
  return (
    `Hi ${first}, just following up from Tidy Home Concierge. Still interested? A quick yes and I'll ` +
    `send times. / Hola ${first}, le escribo de nuevo de Tidy. ¿Sigue interesado/a? Con un sí le ` +
    `mando horarios.`
  );
}

export function smsLink(phone: string | null, body: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `sms:${digits.length === 10 ? `+1${digits}` : `+${digits}`}?&body=${encodeURIComponent(body)}`;
}

/** Mon–Sat 9:00 AM – 7:00 PM, America/New_York. */
export function inTextingWindow(now: Date = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  if (weekday === "Sun") return false;
  return hour >= 9 && hour < 19;
}

/** Calls: weekdays 7:00–8:30 PM, Saturday 9:00–11:00 AM (America/New_York). */
export function inCallWindow(when: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(when);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;
  if (weekday === "Sun") return false;
  if (weekday === "Sat") return mins >= 9 * 60 && mins <= 11 * 60;
  return mins >= 19 * 60 && mins <= 20 * 60 + 30;
}
