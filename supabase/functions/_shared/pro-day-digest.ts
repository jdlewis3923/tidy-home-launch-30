// Tidy — shared builder for the two Pro day digests.
//
// One notification per pro per day, never one per visit. The text carries what
// a contractor needs to walk up to the door: time, address, access notes.
// It NEVER carries the customer's price — that is not their business and it is
// not what they are paid.

export type DigestVisit = {
  id: string;
  scheduled_start: string | null;
  service_type: string | null;
  street: string | null;
  zip: string | null;
  access_notes: string | null;
  gate_code: string | null;
  parking_notes: string | null;
  pet_notes: string | null;
};

const SERVICE_LABEL: Record<string, string> = {
  cleaning: 'Cleaning',
  lawn: 'Lawn',
  detail: 'Car',
  detailing: 'Car',
};

export function etTime(iso: string | null): string {
  if (!iso) return 'time TBD';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** YYYY-MM-DD for an instant, in Eastern time. */
export function etDate(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return p; // en-CA already yields YYYY-MM-DD
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function visitLine(v: DigestVisit): string {
  const service = SERVICE_LABEL[(v.service_type ?? '').toLowerCase()] ?? 'Visit';
  const where = [v.street, v.zip].filter(Boolean).join(', ') || 'address in the app';
  const access = [
    v.gate_code ? `gate ${v.gate_code}` : null,
    v.access_notes,
    v.parking_notes,
    v.pet_notes,
  ]
    .filter(Boolean)
    .join(' · ');
  return `${etTime(v.scheduled_start)} — ${service}, ${where}${access ? ` (${access})` : ''}`;
}

export function digestText(
  visits: DigestVisit[],
  when: 'today' | 'tomorrow',
): { title: string; body: string } {
  const count = visits.length;
  const first = visits[0];
  const title =
    when === 'today'
      ? `${count} job${count === 1 ? '' : 's'} today — first at ${etTime(first?.scheduled_start ?? null)}`
      : `${count} job${count === 1 ? '' : 's'} tomorrow — first at ${etTime(first?.scheduled_start ?? null)}`;
  const body = visits.slice(0, 5).map(visitLine).join('\n');
  return { title, body: count > 5 ? `${body}\n+${count - 5} more in the app` : body };
}

/**
 * UTC instants bounding an Eastern calendar day, DST-correct (the offset is read
 * from the zone itself rather than assumed to be -04:00).
 */
export function etDayRange(day: string): { start: string; end: string } {
  const [y, m, d] = day.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset',
  })
    .formatToParts(noonUtc)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-05:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  const sign = match?.[1] === '+' ? 1 : -1;
  const offsetMin = match ? sign * (Number(match[2]) * 60 + Number(match[3])) : -300;
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60 * 1000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}
