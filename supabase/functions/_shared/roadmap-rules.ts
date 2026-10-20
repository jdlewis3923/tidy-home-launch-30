// Growth roadmap rules — pure, shared by roadmap-tick, the 9 AM digest and tests.
export type RoadmapItem = { id: string; task: string; owner: string; lead_days: number; done: boolean };
export type Initiative = {
  id: string; name: string; launch_date: string; status: string; switch_on: boolean;
  gate_passed: boolean; gate_description: string; build_prompt: string | null; is_template: boolean;
  kickoff_sent_at: string | null; items: RoadmapItem[];
};

const DAY = 864e5;
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);
export const dueDate = (launch: string, lead: number) => addDays(launch, -lead);
export const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

/** Only initiatives the system acts on: not templates, not live, not paused. */
export const active = (i: Initiative) => !i.is_template && i.status !== 'live' && i.status !== 'paused';

export const pctDone = (i: Initiative) => i.items.length ? Math.round((i.items.filter((x) => x.done).length / i.items.length) * 100) : 100;

/** The earliest-due checklist item (the "first step"). */
export function firstItem(i: Initiative) {
  return [...i.items].sort((a, b) => b.lead_days - a.lead_days)[0] ?? null;
}

/** Kickoff fires once, when the first item is 14 days (or fewer) from due. */
export function kickoffDue(i: Initiative, today: string) {
  if (!active(i) || i.kickoff_sent_at) return false;
  const f = firstItem(i); if (!f) return false;
  return daysBetween(today, dueDate(i.launch_date, f.lead_days)) <= 14;
}

export function kickoffText(i: Initiative) {
  const f = firstItem(i)!;
  let t = `New initiative starting: ${i.name}. Launches ${fmt(i.launch_date)}. First step: ${f.task}, due ${fmt(dueDate(i.launch_date, f.lead_days))}. Full checklist: /admin/roadmap`;
  if (i.build_prompt?.trim()) t += ' Build prompt ready to paste into Lovable.';
  return t;
}

export const MILESTONES = [90, 60, 30, 14, 7];
export function milestoneLine(i: Initiative, today: string) {
  if (!active(i)) return null;
  const d = daysBetween(today, i.launch_date);
  return MILESTONES.includes(d) ? `${i.name}: ${d} days out, checklist ${pctDone(i)}% done.` : null;
}

/** Items due in the next 14 days (today inclusive), not done. */
export function comingUp(list: Initiative[], today: string) {
  const end = addDays(today, 14);
  return list.filter(active).flatMap((i) => i.items.filter((x) => !x.done).map((x) => ({ i, x, due: dueDate(i.launch_date, x.lead_days) })))
    .filter((r) => r.due >= today && r.due <= end).sort((a, b) => a.due.localeCompare(b.due));
}

/** URGENT: any overdue item, or launch under 7 days away with the checklist under 100%. */
export function urgentReasons(i: Initiative, today: string): string[] {
  if (!active(i)) return [];
  const out = i.items.filter((x) => !x.done && dueDate(i.launch_date, x.lead_days) < today)
    .map((x) => `Overdue: ${x.task} (due ${fmt(dueDate(i.launch_date, x.lead_days))})`);
  const d = daysBetween(today, i.launch_date);
  if (d >= 0 && d < 7 && pctDone(i) < 100) out.push(`Launches in ${d} days with checklist ${pctDone(i)}% done`);
  return out;
}

/** 8 AM on launch day: switch on only if every item is done AND the gate passes. */
export function launchDecision(i: Initiative, today: string): { go: boolean; missing: string[] } | null {
  if (!active(i) || i.launch_date !== today) return null;
  const missing = i.items.filter((x) => !x.done).map((x) => x.task);
  if (!i.gate_passed) missing.push(`Gate: ${i.gate_description}`);
  return { go: missing.length === 0, missing };
}
