export const HIRE_READY_CAMPAIGN = 'hire-ready-20261022';
export const INVITE_AT = '2026-10-22T12:00:00.000Z';
export const FINISH_AT = '2026-10-23T12:00:00.000Z';
export const NUDGE_AT = '2026-10-23T08:00:00.000Z';
export const ARCHIVE_AT = '2026-10-24T12:00:00.000Z';
export type InviteLanguage = 'en' | 'es' | 'bilingual';
export const weekdaysOnly = (iso: string) => {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date(iso));
  return day !== 'Sat' && day !== 'Sun';
};
export const canNudge = (submitted: boolean, answers: number) => !submitted && answers === 0;
export const canArchive = (submitted: boolean, now: Date) => !submitted && now.getTime() >= Date.parse(ARCHIVE_AT);
export function inviteCopy(first: string, role: string, language: InviteLanguage, link: string, nudge = false) {
  const enRole = role === 'lawn' ? 'Lawn Care Pro' : 'House Cleaning Pro';
  const esRole = role === 'lawn' ? 'Pro de Cuidado del Césped' : 'Pro de Limpieza de Casas';
  const en = nudge
    ? `Hi ${first}, it's Justin from Tidy Home Concierge. We haven't received your application yet: ${link}. The finish deadline was Friday, Oct 23 at 8:00 AM ET; your link remains open until Saturday, Oct 24 at 8:00 AM ET. If you're still interested, please finish today. Thank you!`
    : `Hi ${first}, it's Justin from Tidy Home Concierge. Thanks for applying on Indeed for our ${enRole} opening! Please complete your Tidy application by Friday, Oct 23 at 8:00 AM ET: ${link}. Your answers save as you go. After submitting, pick a time for a 30-minute phone screen, Monday-Friday. No in-person interviews this week. Questions? Reply here. Reply STOP to opt out.`;
  const es = nudge
    ? `Hola ${first}, soy Justin de Tidy Home Concierge. Aún no recibimos tu solicitud: ${link}. El plazo para terminar era el viernes 23 de octubre a las 8:00 a. m., hora de Miami; el enlace sigue abierto hasta el sábado 24 de octubre a las 8:00 a. m. Si sigues interesado, por favor termínala hoy. ¡Gracias!`
    : `Hola ${first}, soy Justin de Tidy Home Concierge. ¡Gracias por postularte en Indeed para el puesto de ${esRole}! Completa tu solicitud de Tidy antes del viernes 23 de octubre a las 8:00 a. m., hora de Miami: ${link}. Tus respuestas se guardan mientras avanzas. Después de enviarla, elige un horario para una llamada de 30 minutos, de lunes a viernes. Esta semana no habrá entrevistas en persona. ¿Tienes preguntas? Responde aquí. Responde STOP para dejar de recibir mensajes.`;
  return { text: language === 'bilingual' ? `${en}\n\n${es}` : language === 'es' ? es : en,
    subject: language === 'es' ? (nudge ? '¿Sigues interesado? Tu solicitud de Tidy' : 'Tu solicitud de Tidy — plazo: viernes a las 8:00 a. m.') : (nudge ? 'Still interested? Your Tidy application' : 'Your Tidy application — due Friday at 8 AM ET') };
}