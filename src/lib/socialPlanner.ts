// Social calendar planner + token renderer. Mirrored byte-for-byte to
// supabase/functions/_shared/socialPlanner.ts (parity-tested). Every launch
// date comes from launch_config; nothing here holds a launch date.

export type SocialChannel = "meta_combined" | "nextdoor";
export type AnchorType = "FIXED" | "LAUNCH" | "CAR_LAUNCH" | "CONVERSION" | "HANGER_DROP_1";
export type NotBefore = "none" | "LAUNCH" | "CAR_LAUNCH";

export type PlanRow = {
  id: string;
  post_number: number | null;
  channel: SocialChannel;
  anchor_type: AnchorType | null;
  anchor_value: string | null; // YYYY-MM-DD for FIXED, integer day offset otherwise
  priority: number | null;
  not_before: NotBefore | null;
  drop_if_bumped: boolean | null;
  is_spare: boolean | null;
  status: string;
  scheduled_for: string | null;
};

export type PlanAnchors = {
  launch: string | null; // cleaning first_visit_date
  carLaunch: string | null; // car first_visit_date
  conversion: string | null; // cleaning conversion_date
  hangerDrop1: string | null; // first day of first hanger drop
};

export type PlanResult = { id: string; date: string | null; scheduled_for: string | null; waiting: null | string };

// Slot window (first/last posting day) set by the owner; not a launch date. Exempt from the launch-date grep.
export const SLOT_FIRST = "2026-10-14";
export const SLOT_LAST = "2027-01-15";
const FIXED_STATUSES = new Set(["posted", "posting", "failed"]);

// ---- date helpers (pure YYYY-MM-DD, UTC-noon arithmetic) ----
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => { const x = d(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const dow = (s: string) => d(s).getUTCDay(); // 0 Sun
const diff = (a: string, b: string) => Math.round((d(a).getTime() - d(b).getTime()) / 864e5);

/** Thanksgiving (4th Thursday of November) — the only no-post date. Computed, never stored. */
export function isSocialBlackout(s: string): boolean {
  const x = d(s);
  if (x.getUTCMonth() !== 10 || x.getUTCDay() !== 4) return false;
  return Math.ceil(x.getUTCDate() / 7) === 4;
}
export function isValidSlot(channel: SocialChannel, s: string): boolean {
  if (s < SLOT_FIRST || s > SLOT_LAST || isSocialBlackout(s)) return false;
  const w = dow(s);
  return channel === "nextdoor" ? w === 4 : w === 1 || w === 3 || w === 5;
}
/** 11:00 AM ET (FB+IG) or 6:00 PM ET (Nextdoor) as a UTC ISO string, DST-aware. */
export function slotInstant(channel: SocialChannel, s: string): string {
  const hour = channel === "nextdoor" ? 18 : 11;
  const guess = new Date(`${s}T${String(hour).padStart(2, "0")}:00:00Z`);
  const etHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(guess));
  const offset = (hour - etHour + 24) % 24; // hours ET is behind UTC (4 or 5)
  return new Date(guess.getTime() + offset * 3600e3).toISOString();
}
export function etDate(instant: string): string {
  return new Date(instant).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function anchorDate(t: AnchorType, a: PlanAnchors): string | null {
  return t === "LAUNCH" ? a.launch : t === "CAR_LAUNCH" ? a.carLaunch : t === "CONVERSION" ? a.conversion : t === "HANGER_DROP_1" ? a.hangerDrop1 : null;
}
export function targetDate(r: PlanRow, a: PlanAnchors): string | null {
  if (!r.anchor_type || r.anchor_value == null) return null;
  if (r.anchor_type === "FIXED") return r.anchor_value;
  const base = anchorDate(r.anchor_type, a);
  return base ? addDays(base, Number(r.anchor_value)) : null;
}

/** Plans every status=scheduled row. Posted/posting/failed rows keep their slot and never move. */
export function planCalendar(rows: PlanRow[], a: PlanAnchors): PlanResult[] {
  const taken = new Set<string>(); // `${channel}|${date}`
  const out = new Map<string, PlanResult>();
  const key = (c: SocialChannel, s: string) => `${c}|${s}`;
  for (const r of rows) if (FIXED_STATUSES.has(r.status) && r.scheduled_for) taken.add(key(r.channel, etDate(r.scheduled_for)));

  const take = (r: PlanRow, s: string) => { taken.add(key(r.channel, s)); out.set(r.id, { id: r.id, date: s, scheduled_for: slotInstant(r.channel, s), waiting: null }); };
  const wait = (r: PlanRow, why: string) => out.set(r.id, { id: r.id, date: null, scheduled_for: null, waiting: why });
  const free = (r: PlanRow, s: string) => isValidSlot(r.channel, s) && !taken.has(key(r.channel, s));

  const live = rows.filter((r) => r.status === "scheduled");
  const planned = live.filter((r) => !r.is_spare).map((r) => ({ r, t: targetDate(r, a) }));
  planned.sort((x, y) => (x.r.priority ?? 9) - (y.r.priority ?? 9) || (x.t ?? "9999").localeCompare(y.t ?? "9999") || (x.r.post_number ?? 0) - (y.r.post_number ?? 0));

  for (const { r, t } of planned) {
    const nbType = r.not_before && r.not_before !== "none" ? r.not_before : null;
    const nb = nbType ? anchorDate(nbType, a) : null;
    const waitLabel = r.anchor_type === "CAR_LAUNCH" || nbType === "CAR_LAUNCH" ? "Waiting for car launch date" : "Waiting for launch date";
    if (!t) { wait(r, waitLabel); continue; }
    if (nbType && (!nb || t < nb)) { wait(r, waitLabel); continue; }
    if (free(r, t)) { take(r, t); continue; }
    if (r.priority === 4) {
      let got: string | null = null;
      for (let k = 1; k <= 7 && !got; k++) {
        for (const c of [addDays(t, -k), addDays(t, k)]) if (!got && (!nb || c >= nb) && free(r, c)) got = c;
      }
      if (got) { take(r, got); continue; }
    }
    if (r.drop_if_bumped) { wait(r, "Bumped this cycle"); continue; }
    let c = addDays(t, 1), got: string | null = null;
    while (c <= SLOT_LAST && !got) { if ((!nb || c >= nb) && free(r, c)) got = c; c = addDays(c, 1); }
    if (got) take(r, got); else wait(r, "No free slot before 15 Jan");
  }

  // Spares fill empty FB+IG slots from the first slot up to (not including) LAUNCH, in order.
  const spares = live.filter((r) => r.is_spare).sort((x, y) => (x.post_number ?? 0) - (y.post_number ?? 0));
  let si = 0;
  if (a.launch) {
    for (let s = SLOT_FIRST; s < a.launch && si < spares.length; s = addDays(s, 1)) {
      if (free(spares[si], s)) { take(spares[si], s); si++; }
    }
  }
  for (; si < spares.length; si++) wait(spares[si], "Spare not needed");
  for (const r of live) if (!out.has(r.id)) wait(r, "Waiting for launch date");
  return [...out.values()];
}

// ---- tokens, filled at the moment of posting ----
const longDay = (s: string) => d(s).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).replace(",", "");
const dayMonth = (s: string) => d(s).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long" });
export function carLine(carLaunch: string | null, today: string): string {
  if (!carLaunch) return "Car care opens as soon as enough neighbors reserve it. Reserve now to be first in line.";
  if (carLaunch > today) return `Car care starts ${longDay(carLaunch)}.`;
  return "Car care is live.";
}
export function renderTemplate(tpl: string, a: PlanAnchors, today: string): string {
  return tpl
    .replace(/\{LAUNCH\}/g, a.launch ? longDay(a.launch) : "{LAUNCH}")
    .replace(/\{CONVERT\}/g, a.conversion ? dayMonth(a.conversion) : "{CONVERT}")
    .replace(/\{CAR_LINE\}/g, carLine(a.carLaunch, today));
}
/** Instagram can't hold links: any line with a jointidy.co URL becomes "Link in bio." */
export function instagramVersion(caption: string): string {
  return caption.split("\n").map((l) => (/jointidy\.co/i.test(l) ? "Link in bio." : l)).join("\n");
}
