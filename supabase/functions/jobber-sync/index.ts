import '../_shared/http.ts';
// jobber-sync — Jobber is the schedule of record; Connecteam is the Pro app.
//
// actions:
//   sync_subscription {subscription_id}  member plan → Jobber client/property + one recurring job per service line
//   backfill                              every real active plan with a client but no jobs
//   reconcile {days?}                     Jobber visits (next N days) → jobber_visits mirror → Connecteam shifts
//   sync_visit {jobber_visit_id}          one visit (webhook path)
//   poll_reports                          Connecteam Visit Report → complete visit, photos, pay line, customer email, alerts
//   register_webhooks                     VISIT_CREATE/UPDATE/DESTROY + JOB_UPDATE → jobber-webhook
//   test_e2e                              throwaway "ZZ Sync Test" client/job → shift for Justin → cleanup
//   introspect {types} / gql {query}      admin diagnostics
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { admin, gql, log } from '../_shared/jobber.ts';
import { createShift, updateShift, deleteShift, getShift, listSubmissions, ConnecteamMissingKey, CT_OWNER_USER_ID, type ShiftInput } from '../_shared/connecteam.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { tidyEmailShell } from '../_shared/email-brand.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SITE_FN = `${Deno.env.get('SUPABASE_URL')}/functions/v1/jobber-webhook`;
const EXCLUDED_EMAIL = /^(qa\..*@tidytestmail\.com|jdlewis3923@gmail\.com)$/i;
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ---------- alerts ----------
async function alert(db: SupabaseClient, key: string, title: string, body: string, tier: 'digest' | 'urgent' = 'digest', extra: Record<string, unknown> = {}) {
  await db.from('admin_alerts').upsert({
    dedupe_key: key, alert_type: 'jobber_connecteam_sync', title: title.slice(0, 200), body: body.slice(0, 3000),
    level: tier === 'urgent' ? 'critical' : 'warning', tier, context: extra,
  } as any, { onConflict: 'dedupe_key', ignoreDuplicates: true }).then(() => {}, () => {});
}

// ---------- catalog ----------
let catalog: Map<string, { id: string; price: number }> | null = null;
async function loadCatalog(db: SupabaseClient) {
  if (catalog) return catalog;
  const d = await gql(db, `{products(first:200){nodes{id name defaultUnitCost}}}`);
  catalog = new Map(d.products.nodes.map((n: any) => [n.name.trim(), { id: n.id, price: Number(n.defaultUnitCost) }]));
  return catalog;
}
const sizeWord = (service: string, n: number) => (service === 'cleaning' && n === 4 ? 'Estate' : service === 'cleaning' && n === 5 ? 'Estate Plus' : `Size ${Math.min(Math.max(n || 1, 1), 3)}`);

interface JobSpec { key: string; title: string; service: string; size: number; items: { name: string; qty: number }[]; rrule: string; }

const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function buildSpecs(sub: any, start: Date): JobSpec[] {
  const lines: any[] = Array.isArray(sub.plan_lines) && sub.plan_lines.length ? sub.plan_lines
    : (sub.services ?? []).map((s: string) => ({ service: s, size_tier: sub.sizes_json?.[s] ?? sub.size_tier ?? sub.size ?? 1, cadence: sub.cadence ?? sub.frequency ?? 'monthly' }));
  const wd = DAY[start.getUTCDay()];
  const freq = (c: string) => c === 'weekly' ? 'FREQ=WEEKLY;INTERVAL=1' : c === 'biweekly' ? 'FREQ=WEEKLY;INTERVAL=2' : `FREQ=MONTHLY;BYDAY=${Math.min(Math.ceil(start.getUTCDate() / 7), 4)}${wd}`;
  const specs: JobSpec[] = [];
  for (const l of lines) {
    const size = Number(l.size_tier ?? 1);
    if (l.service === 'cleaning') {
      const n = `House Cleaning — ${sizeWord('cleaning', size)}`;
      specs.push({ key: 'cleaning', title: n, service: 'cleaning', size, items: [{ name: n, qty: 1 }], rrule: freq(l.cadence) });
    } else if (l.service === 'lawn') {
      const n = `Lawn Care — ${sizeWord('lawn', size)}`;
      specs.push({ key: 'lawn', title: n, service: 'lawn', size, items: [{ name: n, qty: 1 }], rrule: freq(l.cadence) });
    } else if (l.service === 'detailing') {
      const s = sizeWord('detailing', size);
      specs.push({ key: 'detailing_wash', title: `Shine Complete — ${s}`, service: 'detailing', size,
        items: [{ name: `Shine Complete — ${s}`, qty: 1 }, { name: `Maintenance Wash — ${s}`, qty: 1 }],
        rrule: `FREQ=MONTHLY;BYDAY=1${wd},2${wd},3${wd}` });
      specs.push({ key: 'detailing_full', title: `Full Detail — ${s}`, service: 'detailing', size,
        items: [{ name: `Full Detail — ${s}`, qty: 1 }], rrule: 'FREQ=MONTHLY;INTERVAL=6' });
    }
  }
  if (sub.car_wash_key) {
    const cw = parseCarWashKey(sub.car_wash_key);
    const two = cw.washes === 2;
    const s = sizeWord('detailing', cw.size);
    const n = `Car Wash Add-On — ${two ? '2 washes' : '1 wash'} — ${s}`;
    specs.push({ key: 'car_wash', title: n, service: 'detailing', size: Number(s.slice(-1)) || 2, items: [{ name: n, qty: 1 }], rrule: two ? `FREQ=MONTHLY;BYDAY=1${wd},3${wd}` : `FREQ=MONTHLY;BYDAY=2${wd}` });
  }
  return specs;
}
/** car_wash_key is `wash_{size}_x{washes}` (stripe-webhook carWashKeyFromMeta). */
export function parseCarWashKey(key: string): { size: number; washes: 1 | 2 } {
  const m = String(key).match(/^wash_([123])_x([12])$/);
  if (!m) throw new Error(`car_wash_key_unrecognized: "${key}"`);
  return { size: Number(m[1]), washes: Number(m[2]) as 1 | 2 };
}
const sig = (s: JobSpec) => `${s.rrule}|${s.items.map((i) => i.name).join(',')}`;

// ---------- member → Jobber ----------
async function memberContext(db: SupabaseClient, sub: any) {
  const [{ data: prof }, { data: u }] = await Promise.all([
    db.from('profiles').select('*').eq('user_id', sub.user_id).maybeSingle(),
    db.auth.admin.getUserById(sub.user_id),
  ]);
  const { data: firstVisit } = await db.from('visits').select('visit_date, time_window, scheduled_start')
    .eq('subscription_id', sub.id).gte('visit_date', new Date().toISOString().slice(0, 10)).order('visit_date').limit(1).maybeSingle();
  return { prof: prof as any, email: u?.user?.email ?? '', firstVisit: firstVisit as any };
}

function windowFrom(text: string | null | undefined) {
  const m = String(text ?? '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const to24 = (h: number, ap?: string) => (ap ? (ap.toLowerCase() === 'pm' && h < 12 ? h + 12 : ap.toLowerCase() === 'am' && h === 12 ? 0 : h) : h < 7 ? h + 12 : h);
  if (!m) return { start: '09:00:00', minutes: 180, label: String(text || '9 AM – 12 PM') };
  const sh = to24(+m[1], m[3] ?? m[6]); const eh = to24(+m[4], m[6]);
  const minutes = Math.max(60, (eh * 60 + +(m[5] ?? 0)) - (sh * 60 + +(m[2] ?? 0)));
  return { start: `${String(sh).padStart(2, '0')}:${m[2] ?? '00'}:00`, minutes, label: m[0] };
}

async function ensureClient(db: SupabaseClient, sub: any, prof: any, email: string): Promise<{ clientId: string; propertyId: string }> {
  const addr = { street1: prof?.address_line1 ?? '', street2: prof?.address_line2 ?? '', city: prof?.city ?? 'Miami', province: 'FL', postalCode: prof?.zip ?? '', country: 'US' };
  let clientId = sub.jobber_client_id as string | null;
  if (!clientId) {
    const d = await gql(db, `mutation($i:ClientCreateInput!){clientCreate(input:$i){client{id properties{id}} userErrors{message path}}}`, { i: {
      firstName: prof?.first_name ?? '', lastName: prof?.last_name ?? '',
      emails: email ? [{ address: email, primary: true, description: 'MAIN' }] : [],
      phones: prof?.phone ? [{ number: prof.phone, primary: true, description: 'MOBILE', smsAllowed: false }] : [],
      receivesReminders: false, receivesFollowUps: false, receivesReviewRequests: false,
      properties: addr.street1 ? [{ address: addr }] : [],
    } });
    clientId = d.clientCreate.client.id;
    await db.from('subscriptions').update({ jobber_client_id: clientId }).eq('id', sub.id);
    const pid = d.clientCreate.client.properties?.[0]?.id;
    if (pid) return { clientId: clientId!, propertyId: pid };
  }
  const c = await gql(db, `query($id:EncodedId!){client(id:$id){properties{id address{street1 postalCode}}}}`, { id: clientId });
  const props = c.client?.properties ?? [];
  const match = props.find((p: any) => (p.address?.street1 ?? '').trim().toLowerCase() === addr.street1.trim().toLowerCase()) ?? (addr.street1 ? null : props[0]);
  if (match) return { clientId: clientId!, propertyId: match.id };
  if (!addr.street1) throw new Error('member has no service address');
  const p = await gql(db, `mutation($c:EncodedId!,$i:PropertyCreateInput!){propertyCreate(clientId:$c,input:$i){properties{id} userErrors{message path}}}`, { c: clientId, i: { properties: [{ address: addr }] } });
  return { clientId: clientId!, propertyId: p.propertyCreate.properties[0].id };
}

async function closeJob(db: SupabaseClient, jobId: string) {
  await gql(db, `mutation($j:EncodedId!,$i:JobCloseInput!){jobClose(jobId:$j,input:$i){job{id jobStatus} userErrors{message path}}}`,
    { j: jobId, i: { modifyIncompleteVisitsBy: 'COMPLETE_PAST_DESTROY_FUTURE' } });
}

export async function createJob(db: SupabaseClient, propertyId: string, spec: JobSpec, startDate: string, win: { start: string; minutes: number; label: string }, instructions: string) {
  const cat = await loadCatalog(db);
  const items = [] as any[]; const missing: string[] = [];
  for (const it of spec.items) {
    const p = cat.get(it.name);
    if (!p) { missing.push(it.name); continue; }
    items.push({ name: it.name, productOrServiceId: p.id, unitPrice: p.price, quantity: it.qty, saveToProductsAndServices: false });
  }
  if (missing.length) throw new Error(`catalog_mismatch: no Jobber product named ${missing.map((m) => `"${m}"`).join(', ')}`);
  const end = new Date(`${startDate}T${win.start}`); end.setUTCMinutes(end.getUTCMinutes() + win.minutes);
  const d = await gql(db, `mutation($i:JobCreateAttributes!){jobCreate(input:$i){job{id jobNumber} userErrors{message path}}}`, { i: {
    propertyId, title: spec.title, instructions,
    invoicing: { invoicingType: 'VISIT_BASED', invoicingSchedule: 'NEVER' },
    timeframe: { startAt: startDate, durationUnits: 'YEARS', durationValue: 1 },
    scheduling: { createVisits: true, notifyTeam: false, startTime: win.start, endTime: end.toISOString().slice(11, 19), recurrence: `RRULE:${spec.rrule}` },
    arrivalWindow: { durationInMinutes: win.minutes },
    lineItems: items,
  } });
  return d.jobCreate.job.id as string;
}

async function syncSubscription(db: SupabaseClient, subId: string, opts: { allowTest?: boolean } = {}) {
  const { data: sub } = await db.from('subscriptions').select('*').eq('id', subId).maybeSingle();
  if (!sub) return { skipped: 'not_found' };
  const ctx = await memberContext(db, sub);
  if (!opts.allowTest && EXCLUDED_EMAIL.test(ctx.email)) return { skipped: 'test_or_owner' };
  const jobs: Record<string, any> = (sub.jobber_job_ids && typeof sub.jobber_job_ids === 'object' && !Array.isArray(sub.jobber_job_ids)) ? { ...sub.jobber_job_ids } : {};
  const active = sub.status === 'active' && !sub.pause_collection && !(sub.paused_until && new Date(sub.paused_until) > new Date());
  const errors: string[] = [];
  if (!active) {
    for (const [k, v] of Object.entries(jobs)) {
      try { await closeJob(db, (v as any).job_id ?? v); delete jobs[k]; } catch (e) { errors.push(`${k}: ${(e as Error).message}`); }
    }
    await db.from('subscriptions').update({ jobber_job_ids: jobs }).eq('id', sub.id);
    await log(db, 'sync_subscription', errors.length ? 'error' : 'success', errors.join('; ') || `closed jobs (${sub.status})`, { subscription_id: sub.id });
    if (errors.length) await alert(db, `jobber_close_fail:${sub.id}`, 'Jobber job could not be closed', errors.join('\n'), 'digest', { subscription_id: sub.id });
    return { closed: true, errors };
  }
  const { clientId, propertyId } = await ensureClient(db, sub, ctx.prof, ctx.email);
  const startDate = ctx.firstVisit?.visit_date ?? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const win = windowFrom(ctx.firstVisit?.time_window ?? ctx.prof?.preferred_time);
  const notes = [
    `Arrival window: ${win.label}`,
    ctx.prof?.gate_code ? `Gate code: ${ctx.prof.gate_code}` : '', ctx.prof?.parking_notes ? `Parking: ${ctx.prof.parking_notes}` : '',
    ctx.prof?.pets ? `Pets: ${ctx.prof.pets}` : '', ctx.prof?.special_instructions ? `Access/notes: ${ctx.prof.special_instructions}` : '',
    'Pro: fill the Tidy Visit Report in Connecteam before you leave.',
  ].filter(Boolean).join('\n');
  const specs = buildSpecs(sub, new Date(`${startDate}T12:00:00Z`));
  const wanted = new Set(specs.map((s) => s.key));
  for (const [k, v] of Object.entries(jobs)) {
    const spec = specs.find((s) => s.key === k);
    if (!spec || (v as any).sig !== sig(spec)) {
      try { await closeJob(db, (v as any).job_id ?? v); delete jobs[k]; } catch (e) { errors.push(`close ${k}: ${(e as Error).message}`); }
    }
  }
  for (const spec of specs) {
    if (jobs[spec.key]) {
      try { await gql(db, `mutation($j:EncodedId!,$i:JobEditInput!){jobEdit(jobId:$j,input:$i){job{id} userErrors{message path}}}`, { j: jobs[spec.key].job_id, i: { instructions: notes } }); } catch (e) { errors.push(`edit ${spec.key}: ${(e as Error).message}`); }
      continue;
    }
    try { jobs[spec.key] = { job_id: await createJob(db, propertyId, spec, startDate, win, notes), sig: sig(spec), service: spec.service, size: spec.size }; }
    catch (e) { errors.push(`${spec.key}: ${(e as Error).message}`); }
  }
  void wanted;
  await db.from('subscriptions').update({ jobber_job_ids: jobs, jobber_client_id: clientId }).eq('id', sub.id);
  await log(db, 'create_job', errors.length ? 'error' : 'success', errors.join('; ') || `jobs: ${Object.keys(jobs).join(',')}`, { subscription_id: sub.id, jobs });
  if (errors.length) await alert(db, `jobber_sync_fail:${sub.id}:${new Date().toISOString().slice(0, 10)}`, `Jobber sync failed for a member plan`, errors.join('\n'), 'digest', { subscription_id: sub.id });
  return { client_id: clientId, property_id: propertyId, jobs, errors };
}

// ---------- Jobber visits → mirror → Connecteam ----------
const VISIT_FIELDS = `id title startAt endAt isComplete visitStatus instructions
  client{id firstName lastName emails{address}} property{address{street1 street2 city postalCode}}
  job{id title} lineItems(first:20){nodes{name unitPrice totalPrice quantity}}`;

function serviceOf(names: string[]): { service: string; size: number; kind: string } {
  const n = names.join(' | ');
  const size = n.includes('Estate Plus') ? 5 : n.includes('Estate') ? 4 : Number(n.match(/Size (\d)/)?.[1] ?? 1);
  if (n.startsWith('House Cleaning') || n.includes('House Cleaning') || n.includes('Deep Clean')) return { service: 'cleaning', size, kind: n.includes('Deep Clean') ? 'deep_clean' : 'standard' };
  if (n.includes('Lawn Care')) return { service: 'lawn', size, kind: 'standard' };
  if (n.includes('Full Detail')) return { service: 'detailing', size, kind: 'full_detail' };
  if (n.includes('Shine') || n.includes('Wash')) return { service: 'detailing', size, kind: 'maintenance' };
  return { service: 'unknown', size, kind: 'standard' };
}
const SERVICE_LABEL: Record<string, string> = { cleaning: 'House Cleaning', lawn: 'Lawn Care', detailing: 'Car Care', unknown: 'Visit' };

type PoolPro = { connecteam_user_id: number; pro_name: string | null; priority: number };
async function proMap(db: SupabaseClient): Promise<Map<string, PoolPro[]>> {
  const { data } = await db.from('jobber_service_pro_pool').select('service_line, connecteam_user_id, pro_name, priority').eq('active', true).order('priority');
  const m = new Map<string, PoolPro[]>();
  for (const r of (data ?? []) as any[]) { const l = m.get(r.service_line) ?? []; l.push({ ...r, connecteam_user_id: Number(r.connecteam_user_id) }); m.set(r.service_line, l); }
  return m;
}

/** Primary Pro unless she already has an overlapping shift; then the next; null = open shift. */
export function pickPro(pool: PoolPro[], busy: { connecteam_user_id: number; start_at: string; end_at: string }[], startAt: string, endAt: string, current?: number | null): number | null {
  const s = Date.parse(startAt), e = Date.parse(endAt) > s ? Date.parse(endAt) : s + 3600000;
  const free = (u: number) => !busy.some((b) => Number(b.connecteam_user_id) === u && Date.parse(b.start_at) < e && (Date.parse(b.end_at) > Date.parse(b.start_at) ? Date.parse(b.end_at) : Date.parse(b.start_at) + 3600000) > s);
  const ordered = [...pool].sort((a, b) => a.priority - b.priority);
  if (current && ordered.some((p) => p.connecteam_user_id === current) && free(current)) return current;
  return ordered.find((p) => free(p.connecteam_user_id))?.connecteam_user_id ?? null;
}

async function upsertVisit(db: SupabaseClient, v: any, pros: Map<string, PoolPro[]>, overrideUser?: number, isTest = false) {
  const names = (v.lineItems?.nodes ?? []).map((x: any) => x.name);
  const svc = serviceOf(names.length ? names : [v.job?.title ?? v.title ?? '']);
  const a = v.property?.address ?? {};
  const address = [a.street1, a.street2, a.city, 'FL', a.postalCode].filter(Boolean).join(', ');
  const first = v.client?.firstName ?? '';
  const title = `${SERVICE_LABEL[svc.service]} — ${first} ${a.street1 ?? ''}`.trim();
  const { data: subRow } = await db.from('subscriptions').select('id, user_id').eq('jobber_client_id', v.client?.id ?? '-').limit(1).maybeSingle();
  const { data: existing } = await db.from('jobber_visits').select('*').eq('jobber_visit_id', v.id).maybeSingle();
  let ctUser: number | null = overrideUser ?? null;
  if (!overrideUser && v.startAt) {
    const day0 = new Date(Date.parse(v.startAt) - 86400000).toISOString(), day1 = new Date(Date.parse(v.startAt) + 86400000).toISOString();
    const { data: busy } = await db.from('jobber_visits').select('connecteam_user_id, start_at, end_at').is('deleted_at', null)
      .not('connecteam_user_id', 'is', null).neq('jobber_visit_id', v.id).gte('start_at', day0).lte('start_at', day1);
    ctUser = pickPro(pros.get(svc.service) ?? [], (busy ?? []) as any, v.startAt, v.endAt ?? v.startAt, existing?.connecteam_user_id ? Number(existing.connecteam_user_id) : null);
  }
  const row: any = {
    jobber_visit_id: v.id, jobber_job_id: v.job?.id, subscription_id: subRow?.id ?? null, user_id: subRow?.user_id ?? null,
    service_line: svc.service, size_tier: svc.size, visit_kind: svc.kind, title, start_at: v.startAt, end_at: v.endAt ?? v.startAt,
    address, customer_first_name: first, connecteam_user_id: ctUser, raw: v, updated_at: new Date().toISOString(), deleted_at: null,
    is_test: isTest || existing?.is_test || false,
  };
  if (v.isComplete && !existing?.completed_at) row.status = 'complete';
  const { data: saved, error } = await db.from('jobber_visits').upsert(row, { onConflict: 'jobber_visit_id' }).select('*').single();
  if (error) throw new Error(`mirror upsert: ${error.message}`);
  if (saved.status === 'complete' || !v.startAt) return { visit: saved, shift: 'skipped' };
  const win = windowFrom(String(v.instructions ?? '').match(/Arrival window:\s*([^\n]+)/)?.[1]);
  const shift: ShiftInput = {
    title, address,
    startTime: Math.floor(new Date(v.startAt).getTime() / 1000),
    endTime: Math.floor(new Date(v.endAt ?? v.startAt).getTime() / 1000) || Math.floor(new Date(v.startAt).getTime() / 1000) + win.minutes * 60,
    assignedUserId: ctUser,
    notesHtml: `<p><b>Arrival window:</b> ${esc(win.label)}</p><p>${esc(v.instructions ?? '').replace(/\n/g, '<br>')}</p>`
      + `<p><b>Services/add-ons:</b> ${esc(names.join(', '))}</p><p><b>Fill the Tidy Visit Report before you leave.</b></p>`,
  };
  if (shift.endTime <= shift.startTime) shift.endTime = shift.startTime + win.minutes * 60;
  if (saved.connecteam_shift_id) await updateShift(saved.connecteam_shift_id, shift);
  else {
    const id = await createShift(shift);
    await db.from('jobber_visits').update({ connecteam_shift_id: id }).eq('id', saved.id);
    saved.connecteam_shift_id = id;
  }
  if (!ctUser && !isTest) await alert(db, `ct_open_shift:${v.id}`, `Open shift: no ${SERVICE_LABEL[svc.service]} Pro free`, `${title} on ${v.startAt} is an open shift in Connecteam — no ${svc.service} Pro in the list is free for that window. Add a Pro or move the visit.`, 'digest');
  return { visit: saved, shift: saved.connecteam_shift_id };
}

async function removeVisit(db: SupabaseClient, jobberVisitId: string) {
  const { data: m } = await db.from('jobber_visits').select('*').eq('jobber_visit_id', jobberVisitId).maybeSingle();
  if (!m || m.deleted_at) return false;
  if (m.connecteam_shift_id) await deleteShift(m.connecteam_shift_id);
  await db.from('jobber_visits').update({ deleted_at: new Date().toISOString(), status: 'canceled', connecteam_shift_id: null }).eq('id', m.id);
  return true;
}

async function reconcile(db: SupabaseClient, days = 21) {
  const from = new Date(); const to = new Date(Date.now() + days * 86400000);
  const pros = await proMap(db);
  const seen = new Set<string>(); let after: string | null = null; const errors: string[] = []; let synced = 0;
  for (let page = 0; page < 20; page++) {
    const d: any = await gql(db, `query($f:VisitFilterAttributes,$a:String){visits(first:50,after:$a,filter:$f){nodes{${VISIT_FIELDS}} pageInfo{hasNextPage endCursor}}}`,
      { f: { startAt: { after: from.toISOString(), before: to.toISOString() } }, a: after });
    for (const v of d.visits.nodes) {
      seen.add(v.id);
      try { await upsertVisit(db, v, pros); synced++; } catch (e) { errors.push(`${v.id}: ${(e as Error).message}`); if (e instanceof ConnecteamMissingKey) break; }
    }
    if (!d.visits.pageInfo.hasNextPage) break; after = d.visits.pageInfo.endCursor;
  }
  const { data: mirror } = await db.from('jobber_visits').select('jobber_visit_id').is('deleted_at', null).neq('status', 'complete')
    .gte('start_at', from.toISOString()).lte('start_at', to.toISOString());
  let removed = 0;
  for (const m of mirror ?? []) if (!seen.has(m.jobber_visit_id)) { try { if (await removeVisit(db, m.jobber_visit_id)) removed++; } catch (e) { errors.push(`remove ${m.jobber_visit_id}: ${(e as Error).message}`); } }
  await log(db, 'reconcile', errors.length ? 'error' : 'success', errors.slice(0, 5).join('; ') || `synced ${synced}, removed ${removed}`);
  if (errors.length) await alert(db, `jobber_reconcile_fail:${new Date().toISOString().slice(0, 10)}`, 'Jobber → Connecteam sync had errors', errors.slice(0, 10).join('\n'), 'digest');
  return { synced, removed, errors };
}

async function syncVisit(db: SupabaseClient, id: string) {
  const d = await gql(db, `query($id:EncodedId!){visit(id:$id){${VISIT_FIELDS}}}`, { id }).catch(() => ({ visit: null }));
  if (!d.visit) return { removed: await removeVisit(db, id) };
  return await upsertVisit(db, d.visit, await proMap(db));
}

// ---------- Visit Report → close the loop ----------
const Q = { service: 'e1e393dc', customer: 'cb8b9d3b', before: '50f5908c', checklist: '4362411d', after: '21a07a18', locked: 'c061e4da', issues: '4566420b', issuePhotos: 'ae469575' };
function answer(sub: any, prefix: string) { return (sub.answers ?? []).find((a: any) => String(a.questionId ?? '').startsWith(prefix)); }
const urlsIn = (a: any) => a ? [...JSON.stringify(a).matchAll(/https?:\/\/[^"\\\s]+/g)].map((m) => m[0]) : [];
function yesNo(a: any): boolean | null {
  if (!a) return null; const s = JSON.stringify(a);
  if (/"yesNoOptionId"\s*:\s*1|"(text|value|answer)"\s*:\s*"No"/i.test(s)) return false;
  if (/"yesNoOptionId"\s*:\s*0|"(text|value|answer)"\s*:\s*"Yes"/i.test(s)) return true;
  return null;
}
function textOf(a: any): string { if (!a) return ''; return String(a.value ?? a.text ?? a.answer ?? a.openEndedAnswer ?? '').trim(); }
const tokens = (s: string) => new Set(String(s).toLowerCase().match(/[a-z0-9]+/g) ?? []);

export function matchVisit(sub: any, candidates: any[]): any | null {
  const user = Number(sub.submittingUserId ?? sub.userId);
  const ts = Number(sub.submissionTimestamp ?? sub.submittingTimestamp ?? sub.createdAt ?? 0) * 1000;
  const day = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const said = tokens(textOf(answer(sub, Q.customer)));
  let best: any = null; let bestScore = 0;
  for (const c of candidates) {
    if (c.connecteam_user_id && Number(c.connecteam_user_id) !== user) continue;
    if (new Date(c.start_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) !== day) continue;
    const addr = tokens(c.address ?? '');
    const num = String(c.address ?? '').match(/^\d+/)?.[0];
    let score = 1 + [...addr].filter((t) => said.has(t)).length + (num && said.has(num) ? 3 : 0);
    if (said.has(String(c.customer_first_name ?? '').toLowerCase())) score += 2;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

function fridayAfter(d: Date) { const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const fri = new Date(monday); fri.setUTCDate(monday.getUTCDate() + 11); return { week_start: monday.toISOString().slice(0, 10), payout_friday: fri.toISOString().slice(0, 10) }; }

async function pollReports(db: SupabaseClient) {
  const since = Math.floor((Date.now() - 3 * 86400000) / 1000);
  const subs = await listSubmissions(since);
  const { data: open } = await db.from('jobber_visits').select('*').is('deleted_at', null).is('report_submission_id', null)
    .gte('start_at', new Date(Date.now() - 4 * 86400000).toISOString());
  const { data: done } = await db.from('jobber_visits').select('report_submission_id').not('report_submission_id', 'is', null);
  const used = new Set((done ?? []).map((r: any) => String(r.report_submission_id)));
  const pros = await proMap(db);
  let matched = 0; const unmatched: string[] = [];
  for (const s of subs) {
    const sid = String(s.formSubmissionId ?? s.submissionId ?? s.id);
    if (used.has(sid)) continue;
    const v = matchVisit(s, (open ?? []).filter((o: any) => !o.report_submission_id));
    if (!v) { unmatched.push(sid); continue; }
    v.report_submission_id = sid; matched++;
    await processReport(db, s, sid, v);
  }
  // No report 2h after the window ends → digest alert.
  const cutoff = new Date(Date.now() - 2 * 3600000).toISOString();
  const { data: late } = await db.from('jobber_visits').select('id, jobber_visit_id, title, end_at').is('deleted_at', null).is('report_submission_id', null)
    .is('no_report_alerted_at', null).eq('is_test', false).lt('end_at', cutoff).gte('end_at', new Date(Date.now() - 7 * 86400000).toISOString());
  for (const l of late ?? []) {
    await alert(db, `visit_no_report:${l.jobber_visit_id}`, `No Visit Report: ${l.title}`, `The window ended ${l.end_at} and no Tidy Visit Report has come in.`, 'digest');
    await db.from('jobber_visits').update({ no_report_alerted_at: new Date().toISOString() }).eq('id', l.id);
  }
  await log(db, 'poll_reports', 'success', `submissions ${subs.length}, matched ${matched}, unmatched ${unmatched.length}, late ${late?.length ?? 0}`);
  if (unmatched.length) await alert(db, `visit_report_unmatched:${unmatched.sort().join(',').slice(0, 150)}`, 'Visit Report did not match a visit', `Submission ids: ${unmatched.join(', ')}`, 'digest');
  return { submissions: subs.length, matched, unmatched, late: late?.length ?? 0 };
}

async function processReport(db: SupabaseClient, s: any, sid: string, v: any, opts: { emailTo?: string } = {}) {
    const before = urlsIn(answer(s, Q.before)); const after = urlsIn(answer(s, Q.after)); const issuePhotos = urlsIn(answer(s, Q.issuePhotos));
    const checklist = yesNo(answer(s, Q.checklist)); const locked = yesNo(answer(s, Q.locked)); const issues = textOf(answer(s, Q.issues));
    const completedAt = new Date(Number(s.submissionTimestamp ?? Date.now() / 1000) * 1000).toISOString();
    const { data: pay } = await db.rpc('contractor_visit_pay_cents', { _service: v.service_line, _size: v.size_tier ?? 1, _cadence: 'monthly', _tier: null, _surcharge: false, _visit_kind: v.visit_kind });
    await db.from('jobber_visits').update({ report_submission_id: sid, before_photos: before, after_photos: after, checklist_done: checklist, locked_up: locked,
      issues: issues || null, completed_at: completedAt, status: 'complete', pro_pay_cents: pay ?? null, updated_at: new Date().toISOString() }).eq('id', v.id);
    let jobberErr = '';
    try { await gql(db, `mutation($v:EncodedId!,$i:VisitCompleteInput){visitComplete(visitId:$v,input:$i){visit{id isComplete} userErrors{message path}}}`, { v: v.jobber_visit_id, i: { completedAt } }); }
    catch (e) { jobberErr = (e as Error).message; await alert(db, `jobber_complete_fail:${v.jobber_visit_id}`, 'Could not mark Jobber visit complete', `${v.title}: ${jobberErr}`, 'digest'); }
    // Pay lines are built by pro-pay from completed visits (Friday statement).
    if (checklist === false || locked === false || issues) {
      await alert(db, `visit_report_problem:${v.jobber_visit_id}`, `Visit problem reported: ${v.title}`,
        [checklist === false ? 'Checklist NOT done.' : '', locked === false ? 'Home/car NOT locked up.' : '', issues ? `Issues: ${issues}` : '', issuePhotos.length ? `Photos: ${issuePhotos.join(' ')}` : ''].filter(Boolean).join('\n'),
        'urgent', { jobber_visit_id: v.jobber_visit_id });
    }
    let emailed: unknown = null;
    if (opts.emailTo && after.length) emailed = await emailCustomer(db, v, after, opts.emailTo);
    else if (!v.is_test && v.user_id && after.length) emailed = await emailCustomer(db, v, after);
    return { before, after, checklist, locked, issues, completedAt, jobberErr, emailed };
}

async function emailCustomer(db: SupabaseClient, v: any, after: string[], forceTo?: string) {
  let email: string | undefined = forceTo;
  if (!email) { const { data: u } = await db.auth.admin.getUserById(v.user_id); email = u?.user?.email; if (!email || EXCLUDED_EMAIL.test(email)) return { sent: false, reason: 'excluded' }; }
  const { data: prof } = v.user_id ? await db.from('profiles').select('language, first_name').eq('user_id', v.user_id).maybeSingle() : { data: null as any };
  const es = String(prof?.language ?? 'en').trim() === 'es';
  const svc = { cleaning: es ? 'limpieza' : 'cleaning', lawn: es ? 'césped' : 'lawn care', detailing: es ? 'cuidado del auto' : 'car care' }[v.service_line as string] ?? (es ? 'visita' : 'visit');
  const imgs = after.slice(0, 6).map((u) => `<img src="${esc(u)}" alt="" width="260" style="width:260px;max-width:48%;border-radius:10px;margin:4px;display:inline-block">`).join('');
  const res = await sendBrevoEmail({
    to: [{ email }], marketing: false,
    subject: es ? `Tu ${svc} está completa` : `Your ${svc} visit is complete`,
    htmlContent: tidyEmailShell({
      heading: es ? 'Visita completa' : 'Visit complete', eyebrow: 'Tidy Home Concierge', artTopic: 'visit',
      bodyHtml: `<p>${es ? `Hola ${esc(prof?.first_name ?? '')}, tu Pro terminó. Aquí están las fotos de después:` : `Hi ${esc(prof?.first_name ?? '')}, your Pro just finished. Here are the after photos:`}</p><div>${imgs}</div>`,
      ctaUrl: 'https://jointidy.co/account', ctaLabel: es ? 'Abrir mi cuenta' : 'Open your account',
    }),
    tags: ['visit-complete'], label: 'visit-complete',
  });
  if (res.sent) await db.from('jobber_visits').update({ customer_emailed_at: new Date().toISOString() }).eq('id', v.id);
  else if (!forceTo) await alert(db, `visit_email_fail:${v.jobber_visit_id}`, 'Visit-complete email failed', `${v.title}: ${res.reason ?? 'unknown'}`, 'digest');
}

// ---------- webhooks ----------
async function registerWebhooks(db: SupabaseClient) {
  const out: any[] = [];
  for (const topic of ['VISIT_CREATE', 'VISIT_UPDATE', 'VISIT_DESTROY', 'JOB_UPDATE']) {
    try {
      const d = await gql(db, `mutation($i:WebhookEndpointCreateInput!){webhookEndpointCreate(input:$i){webhookEndpoint{id topic url} userErrors{message path}}}`, { i: { topic, url: SITE_FN } });
      out.push({ topic, ok: true, id: d.webhookEndpointCreate.webhookEndpoint?.id });
    } catch (e) { out.push({ topic, ok: false, error: (e as Error).message }); }
  }
  await log(db, 'register_webhooks', out.every((o) => o.ok) ? 'success' : 'warning', JSON.stringify(out));
  return out;
}

// ---------- end-to-end test ----------
async function testE2E(db: SupabaseClient) {
  const steps: Record<string, unknown> = {};
  const c = await gql(db, `mutation($i:ClientCreateInput!){clientCreate(input:$i){client{id properties{id}} userErrors{message path}}}`, { i: {
    firstName: 'ZZ Sync', lastName: 'Test', receivesReminders: false, receivesFollowUps: false, receivesReviewRequests: false,
    properties: [{ address: { street1: '9999 SW Test Ln', city: 'Miami', province: 'FL', postalCode: '33156', country: 'US' } }],
  } });
  const clientId = c.clientCreate.client.id; const propertyId = c.clientCreate.client.properties[0].id;
  steps.client_id = clientId; steps.property_id = propertyId;
  try {
    const start = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const spec = buildSpecs({ plan_lines: [{ service: 'cleaning', size_tier: 2, cadence: 'weekly' }] }, new Date(`${start}T12:00:00Z`))[0];
    const jobId = await createJob(db, propertyId, spec, start, windowFrom('9 AM - 12 PM'), 'Arrival window: 9 AM - 12 PM\nTEST ONLY — ZZ Sync Test. Fill the Tidy Visit Report before you leave.');
    steps.job_id = jobId;
    const j = await gql(db, `query($id:EncodedId!){job(id:$id){id jobNumber title jobStatus visits(first:5){nodes{${VISIT_FIELDS}}}}}`, { id: jobId });
    const visits = j.job.visits.nodes; steps.job_number = j.job.jobNumber; steps.visits = visits.map((v: any) => ({ id: v.id, startAt: v.startAt }));
    if (!visits.length) throw new Error('job created but Jobber returned no visits');
    const r = await upsertVisit(db, visits[0], await proMap(db), CT_OWNER_USER_ID, true);
    steps.mirror_id = r.visit.id; steps.shift_id = r.shift;
    const shift = await getShift(String(r.shift));
    steps.shift_seen_in_connecteam = !!shift; steps.shift_assigned = shift?.assignedUserIds ?? shift?.shifts?.[0]?.assignedUserIds ?? null;
    await deleteShift(String(r.shift)); steps.shift_deleted = !(await getShift(String(r.shift)));
    await db.from('jobber_visits').update({ deleted_at: new Date().toISOString(), status: 'canceled', connecteam_shift_id: null }).eq('id', r.visit.id);
    await closeJob(db, jobId); steps.job_closed = true;
  } catch (e) { steps.error = (e as Error).message; }
  finally {
    try { await gql(db, `mutation($c:EncodedId!){clientArchive(clientId:$c){client{id isArchived} userErrors{message path}}}`, { c: clientId }); steps.client_archived = true; }
    catch (e) { steps.archive_error = (e as Error).message; }
  }
  await log(db, 'test_e2e', steps.error ? 'error' : 'success', JSON.stringify(steps).slice(0, 1900));
  return steps;
}


// ---------- customer skip (Jobber-owned plans) ----------
async function skipVisit(db: SupabaseClient, mirrorId: string) {
  const { data: m } = await db.from('jobber_visits').select('*').eq('id', mirrorId).maybeSingle();
  if (!m) throw new Error('mirror visit not found');
  if (m.customer_skipped_at) return { already: true };
  const d = await gql(db, `mutation($ids:[EncodedId!]!){visitDelete(visitIds:$ids){visits{id} userErrors{message path}}}`, { ids: [m.jobber_visit_id] });
  const errs = d.visitDelete?.userErrors ?? []; if (errs.length) throw new Error(errs.map((e: any) => e.message).join('; '));
  if (m.connecteam_shift_id) await deleteShift(m.connecteam_shift_id);
  await db.from('jobber_visits').update({ customer_skipped_at: new Date().toISOString(), deleted_at: new Date().toISOString(), status: 'canceled', connecteam_shift_id: null }).eq('id', m.id);
  return { skipped: true, jobber_visit_id: m.jobber_visit_id };
}

// ---------- throwaway client helper ----------
async function withTestClient<T>(db: SupabaseClient, label: string, fn: (propertyId: string, clientId: string) => Promise<T>) {
  const c = await gql(db, `mutation($i:ClientCreateInput!){clientCreate(input:$i){client{id properties{id}} userErrors{message path}}}`, { i: {
    firstName: 'ZZ Sync', lastName: label, receivesReminders: false, receivesFollowUps: false, receivesReviewRequests: false,
    properties: [{ address: { street1: '9999 SW Test Ln', city: 'Miami', province: 'FL', postalCode: '33156', country: 'US' } }],
  } });
  const clientId = c.clientCreate.client.id; const propertyId = c.clientCreate.client.properties[0].id;
  const out: any = { client_id: clientId };
  try { out.result = await fn(propertyId, clientId); } catch (e) { out.error = (e as Error).message; }
  finally {
    try { await gql(db, `mutation($c:EncodedId!){clientArchive(clientId:$c){client{id isArchived} userErrors{message path}}}`, { c: clientId }); out.client_archived = true; }
    catch (e) { out.archive_error = (e as Error).message; }
  }
  return out;
}

// ---------- simulated Visit Report (real form 20738257 answer shape) ----------
const TEST_PHOTO = (n: string) => `https://jointidy.co/og-founding.jpg?test=${n}`;
async function testReport(db: SupabaseClient) {
  const steps: Record<string, unknown> = {};
  const t0 = new Date().toISOString();
  const out = await withTestClient(db, 'Report Test', async (propertyId) => {
    const start = new Date(Date.now() - 86400000 * 0).toISOString().slice(0, 10);
    const spec = buildSpecs({ plan_lines: [{ service: 'cleaning', size_tier: 2, cadence: 'monthly' }] }, new Date(`${start}T12:00:00Z`))[0];
    const jobId = await createJob(db, propertyId, spec, start, windowFrom('9 AM - 12 PM'), 'Arrival window: 9 AM - 12 PM\nTEST ONLY — simulated Visit Report.');
    steps.job_id = jobId;
    const j = await gql(db, `query($id:EncodedId!){job(id:$id){visits(first:3){nodes{${VISIT_FIELDS}}}}}`, { id: jobId });
    const jv = j.job.visits.nodes[0]; if (!jv) throw new Error('no visit');
    const r = await upsertVisit(db, jv, await proMap(db), CT_OWNER_USER_ID, true);
    steps.jobber_visit_id = jv.id; steps.mirror_id = r.visit.id; steps.shift_id = r.shift;
    const ts = Math.floor(Date.parse(jv.startAt) / 1000) + 2 * 3600;
    const submission = {
      formSubmissionId: `sim-${Date.now()}`, formId: 20738257, submittingUserId: CT_OWNER_USER_ID, submissionTimestamp: ts,
      answers: [
        { questionId: `${Q.service}-sim`, questionType: 'multipleChoice', selectedAnswers: [{ text: 'House Cleaning' }] },
        { questionId: `${Q.customer}-sim`, questionType: 'openEnded', value: 'ZZ Sync 9999 SW Test Ln' },
        { questionId: `${Q.before}-sim`, questionType: 'image', images: [{ url: TEST_PHOTO('before1') }, { url: TEST_PHOTO('before2') }] },
        { questionId: `${Q.checklist}-sim`, questionType: 'yesNo', yesNoOptionId: 0, value: 'Yes' },
        { questionId: `${Q.after}-sim`, questionType: 'image', images: [{ url: TEST_PHOTO('after1') }, { url: TEST_PHOTO('after2') }] },
        { questionId: `${Q.locked}-sim`, questionType: 'yesNo', yesNoOptionId: 0, value: 'Yes' },
        { questionId: `${Q.issues}-sim`, questionType: 'openEnded', value: '' },
      ],
    };
    const { data: cand } = await db.from('jobber_visits').select('*').eq('id', r.visit.id);
    const matched = matchVisit(submission, cand ?? []);
    steps.matched = matched?.id === r.visit.id;
    if (!matched) throw new Error('simulated submission did not match');
    steps.processed = await processReport(db, submission, submission.formSubmissionId, matched, { emailTo: 'jdlewis3923@gmail.com' });
    const chk = await gql(db, `query($id:EncodedId!){visit(id:$id){id isComplete}}`, { id: jv.id });
    steps.jobber_visit_complete = chk.visit?.isComplete;
    const { data: mirror } = await db.from('jobber_visits').select('status, completed_at, before_photos, after_photos, checklist_done, locked_up').eq('id', r.visit.id).single();
    steps.mirror = mirror;
    // pay line via pro-pay (test data only)
    const pr = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/pro-pay`, { method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'build_week_test', week_start: String(mirror?.completed_at).slice(0, 10) }) });
    steps.pay_build = pr.status;
    const { data: lines } = await db.from('pro_pay_lines').select('id, line_key, kind, pay_cents, connecteam_user_id').eq('is_test', true).like('line_key', `%${jv.id}%`);
    steps.pay_lines = lines;
    // cleanup
    await db.from('pro_pay_lines').delete().eq('is_test', true).gte('created_at', t0);
    if (r.shift && r.shift !== 'skipped') await deleteShift(String(r.shift));
    const { data: m2 } = await db.from('jobber_visits').select('connecteam_shift_id').eq('id', r.visit.id).single();
    if (m2?.connecteam_shift_id) await deleteShift(m2.connecteam_shift_id);
    await db.from('jobber_visits').update({ deleted_at: new Date().toISOString(), connecteam_shift_id: null }).eq('id', r.visit.id);
    await closeJob(db, jobId); steps.job_closed = true; steps.cleaned_up = true;
    return steps;
  });
  await log(db, 'test_report', out.error ? 'error' : 'success', JSON.stringify(out).slice(0, 1900));
  return out;
}

// ---------- car-wash add-on mapping ----------
async function testCarWash(db: SupabaseClient) {
  const cat = await loadCatalog(db);
  const keys = ['wash_1_x1', 'wash_1_x2', 'wash_2_x1', 'wash_2_x2', 'wash_3_x1', 'wash_3_x2'];
  const mapping = keys.map((k) => { const sp = buildSpecs({ plan_lines: [], car_wash_key: k }, new Date('2026-11-10T12:00:00Z')).find((x) => x.key === 'car_wash')!;
    return { key: k, item: sp.items[0].name, rrule: sp.rrule, in_jobber_catalog: cat.has(sp.items[0].name) }; });
  const live = await withTestClient(db, 'Car Wash Test', async (propertyId) => {
    const res: any[] = [];
    for (const k of ['wash_2_x1', 'wash_2_x2']) {
      const sp = buildSpecs({ plan_lines: [], car_wash_key: k }, new Date(`${new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)}T12:00:00Z`)).find((x) => x.key === 'car_wash')!;
      const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      const jobId = await createJob(db, propertyId, sp, start, windowFrom('9 AM - 11 AM'), 'TEST ONLY — car wash add-on mapping.');
      const j = await gql(db, `query($id:EncodedId!){job(id:$id){id title lineItems{nodes{name quantity}} visits(first:12){nodes{startAt}}}}`, { id: jobId }).catch(async () =>
        gql(db, `query($id:EncodedId!){job(id:$id){id title lineItems{nodes{name quantity}} visits(first:10){nodes{startAt}}}}`, { id: jobId }));
      const starts = (j.job.visits.nodes ?? []).map((v: any) => v.startAt);
      const firstMonth = starts.filter((t: string) => Date.parse(t) < Date.parse(start) + 31 * 86400000).length;
      res.push({ key: k, job_id: jobId, title: j.job.title, line_items: j.job.lineItems.nodes, visits_in_first_31_days: firstMonth, visit_starts: starts, rrule: sp.rrule });
      await closeJob(db, jobId);
    }
    return res;
  });
  await log(db, 'test_carwash', live.error ? 'error' : 'success', JSON.stringify({ mapping, live }).slice(0, 1900));
  return { mapping, live };
}

async function backfill(db: SupabaseClient) {
  const { data } = await db.from('subscriptions').select('id, jobber_job_ids').eq('status', 'active');
  const out: any[] = [];
  for (const s of data ?? []) {
    if (s.jobber_job_ids && Object.keys(s.jobber_job_ids).length) continue;
    try { out.push({ id: s.id, ...(await syncSubscription(db, s.id)) }); } catch (e) { out.push({ id: s.id, error: (e as Error).message }); }
  }
  return out;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const body = await req.json().catch(() => ({}));
  const db = admin();
  try {
    switch (body.action) {
      case 'sync_subscription': return jsonResponse({ ok: true, result: await syncSubscription(db, body.subscription_id) });
      case 'backfill': return jsonResponse({ ok: true, result: await backfill(db) });
      case 'reconcile': return jsonResponse({ ok: true, result: await reconcile(db, body.days ?? 21) });
      case 'sync_visit': return jsonResponse({ ok: true, result: await syncVisit(db, body.jobber_visit_id) });
      case 'poll_reports': return jsonResponse({ ok: true, result: await pollReports(db) });
      case 'register_webhooks': return jsonResponse({ ok: true, result: await registerWebhooks(db) });
      case 'skip_visit': return jsonResponse({ ok: true, result: await skipVisit(db, body.mirror_id) });
      case 'test_report': return jsonResponse({ ok: true, result: await testReport(db) });
      case 'test_carwash': return jsonResponse({ ok: true, result: await testCarWash(db) });
      case 'test_e2e': return jsonResponse({ ok: true, result: await testE2E(db) });
      case 'gql': return jsonResponse(await gql(db, body.query, body.variables ?? {}));
      default: return jsonResponse({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message;
    await log(db, body.action ?? 'jobber-sync', 'error', msg);
    if (e instanceof ConnecteamMissingKey) await alert(db, 'connecteam_key_missing', 'Connecteam key missing', 'Add CONNECTEAM_API_KEY so visits can become Connecteam shifts.', 'digest');
    else await alert(db, `jobber_sync_crash:${body.action}:${new Date().toISOString().slice(0, 13)}`, `Jobber sync (${body.action}) failed`, msg, 'digest');
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
