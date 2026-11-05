import './http.ts';
// Tidy — Connecteam REST client (Connecteam is the Pro app, Nov 2026).
// Never sends activation or SMS: shifts are created with notifyUsers=false.

export const CT_BASE = 'https://api.connecteam.com';
export const CT_SCHEDULER_ID = 20735999;
export const CT_VISIT_REPORT_FORM_ID = Number(Deno.env.get('CONNECTEAM_VISIT_FORM_ID') ?? 20738257);
export const CT_OWNER_USER_ID = 31157330;

export class ConnecteamMissingKey extends Error { constructor() { super('connecteam_not_configured: CONNECTEAM_API_KEY is not set'); } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function ct<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const key = Deno.env.get('CONNECTEAM_API_KEY');
  if (!key) throw new ConnecteamMissingKey();
  let last: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${CT_BASE}${path}`, {
        method,
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (res.status === 404 && method === 'DELETE') return {} as T; // already gone
      if (!res.ok) {
        const err = new Error(`connecteam ${method} ${path} [${res.status}] ${text.slice(0, 400)}`);
        if (res.status >= 400 && res.status < 500 && res.status !== 429) { last = err; break; }
        throw err;
      }
      return (text ? JSON.parse(text) : {}) as T;
    } catch (e) {
      last = e as Error;
      if (attempt < 2) await sleep(1000 * 3 ** attempt);
    }
  }
  throw last ?? new Error('connecteam call failed');
}

export interface ShiftInput {
  title: string;
  startTime: number; // unix seconds
  endTime: number;
  address: string;
  notesHtml: string;
  assignedUserId: number | null;
}

function shiftBody(s: ShiftInput) {
  const open = !s.assignedUserId;
  return {
    title: s.title.slice(0, 120),
    startTime: s.startTime,
    endTime: s.endTime,
    timezone: 'America/New_York',
    isOpenShift: open,
    ...(open ? { openSpots: 1 } : { assignedUserIds: [s.assignedUserId] }),
    isPublished: true,
    locationData: { isReferencedToJob: false, gps: { address: s.address } },
    notes: [{ type: 'html', html: s.notesHtml }],
  };
}

export async function createShift(s: ShiftInput): Promise<string> {
  const r = await ct<any>('POST', `/scheduler/v1/schedulers/${CT_SCHEDULER_ID}/shifts?notifyUsers=false`, [shiftBody(s)]);
  const id = r?.data?.shifts?.[0]?.id;
  if (!id) throw new Error(`connecteam createShift returned no id: ${JSON.stringify(r).slice(0, 300)}`);
  return String(id);
}

export async function updateShift(id: string, s: ShiftInput): Promise<void> {
  await ct('PUT', `/scheduler/v1/schedulers/${CT_SCHEDULER_ID}/shifts?notifyUsers=false`, [{ shiftId: id, ...shiftBody(s) }]);
}

export async function deleteShift(id: string): Promise<void> {
  await ct('DELETE', `/scheduler/v1/schedulers/${CT_SCHEDULER_ID}/shifts/${encodeURIComponent(id)}?notifyUsers=false`);
}

export async function getShift(id: string): Promise<any | null> {
  try {
    const r = await ct<any>('GET', `/scheduler/v1/schedulers/${CT_SCHEDULER_ID}/shifts/${encodeURIComponent(id)}`);
    return r?.data ?? null;
  } catch { return null; }
}

export async function listSubmissions(sinceSec: number): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  for (let page = 0; page < 10; page++) {
    const r = await ct<any>('GET', `/forms/v1/forms/${CT_VISIT_REPORT_FORM_ID}/form-submissions?limit=100&offset=${offset}&submittingStartTimestamp=${sinceSec}`);
    const subs = r?.data?.formSubmissions ?? r?.data?.submissions ?? [];
    out.push(...subs);
    if (subs.length < 100) break;
    offset += 100;
  }
  return out;
}
