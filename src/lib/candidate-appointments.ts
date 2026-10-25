export type CandidateAppointment = { kind: string; starts_at: string; status: string };
export function bookedAppointments(slots: CandidateAppointment[], now = Date.now()) {
  return slots.filter(s => s.status === 'booked').sort((a, b) => {
    const af = Date.parse(a.starts_at) >= now, bf = Date.parse(b.starts_at) >= now;
    return Number(bf) - Number(af) || (af ? Date.parse(a.starts_at) - Date.parse(b.starts_at) : Date.parse(b.starts_at) - Date.parse(a.starts_at));
  });
}
export function appointmentLabel(slot: CandidateAppointment, now = Date.now()) {
  const when = new Date(slot.starts_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${slot.kind === 'phone' ? 'Phone call' : 'In-person interview'} ${Date.parse(slot.starts_at) < now ? 'PAST booking' : 'BOOKED'}: ${when} ET`;
}
