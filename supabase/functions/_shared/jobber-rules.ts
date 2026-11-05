// Pure Jobber/Connecteam rules (no Deno APIs) — tested in src/test/jobber-rules.test.ts.
export type PoolPro = { connecteam_user_id: number; pro_name: string | null; priority: number };

/** car_wash_key is `wash_{size}_x{washes}` (stripe-webhook carWashKeyFromMeta). */
export function parseCarWashKey(key: string): { size: number; washes: 1 | 2 } {
  const m = String(key).match(/^wash_([123])_x([12])$/);
  if (!m) throw new Error(`car_wash_key_unrecognized: "${key}"`);
  return { size: Number(m[1]), washes: Number(m[2]) as 1 | 2 };
}

/** Primary Pro unless she already has an overlapping shift; then the next; null = open shift. */
export function pickPro(pool: PoolPro[], busy: { connecteam_user_id: number; start_at: string; end_at: string }[], startAt: string, endAt: string, current?: number | null): number | null {
  const s = Date.parse(startAt), e = Date.parse(endAt) > s ? Date.parse(endAt) : s + 3600000;
  const free = (u: number) => !busy.some((b) => Number(b.connecteam_user_id) === u && Date.parse(b.start_at) < e && (Date.parse(b.end_at) > Date.parse(b.start_at) ? Date.parse(b.end_at) : Date.parse(b.start_at) + 3600000) > s);
  const ordered = [...pool].sort((a, b) => a.priority - b.priority);
  if (current && ordered.some((p) => p.connecteam_user_id === current) && free(current)) return current;
  return ordered.find((p) => free(p.connecteam_user_id))?.connecteam_user_id ?? null;
}

