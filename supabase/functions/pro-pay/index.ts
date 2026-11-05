import '../_shared/http.ts';
// pro-pay — Pro pay from completed Connecteam Visit Reports. Never moves money.
// actions:
//   build_week {week_start?}            (re)build owed lines for a pay week (default: last completed week)
//   match_reviews                       match five-star Google reviews to Pros (exact → auto, fuzzy → owner queue)
//   decide_review {id, approve, ct_user_id?}
//   set_outcome {jobber_visit_id, outcome, team_user_ids?}
//   statements {week_start?, dry_run?}  build + email each Pro a branded statement (EN/ES)
//   test_week                           compute a full test week on is_test data, no emails
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { admin } from '../_shared/jobber.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { tidyEmailShell } from '../_shared/email-brand.ts';
import * as R from '../_shared/pro-pay-rules.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const BASE_NAMES = /^(House Cleaning|Lawn Care|Shine Complete|Maintenance Wash|Full Detail|Car Wash Add-On)/;
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function alert(db: SupabaseClient, key: string, title: string, body: string) {
  await db.from('admin_alerts').upsert({ dedupe_key: key, alert_type: 'pro_pay', title, body, level: 'warning', tier: 'digest' } as any, { onConflict: 'dedupe_key', ignoreDuplicates: true }).then(() => {}, () => {});
}

function weekBounds(weekStart: string) {
  // Miami week: Monday 00:00 ET → next Monday 00:00 ET (EST/EDT handled by 4–5h offset window search below).
  const start = new Date(`${weekStart}T05:00:00Z`); const end = new Date(start.getTime() + 7 * 86400000);
  return { start, end };
}

async function upsertLine(db: SupabaseClient, l: Record<string, unknown>) {
  const { data: ex } = await db.from('pro_pay_lines').select('status').eq('line_key', l.line_key as string).maybeSingle();
  if (ex && ex.status === 'paid') return; // never rewrite paid lines
  await db.from('pro_pay_lines').upsert(l as any, { onConflict: 'line_key' });
}

async function buildWeek(db: SupabaseClient, weekStart: string, testOnly = false) {
  const wk = R.payWeek(new Date(`${weekStart}T17:00:00Z`));
  const { start, end } = weekBounds(wk.week_start);
  const { data: profiles } = await db.from('pro_pay_profiles').select('*').eq('is_test', testOnly);
  const prof = new Map((profiles ?? []).map((p: any) => [Number(p.connecteam_user_id), p]));
  let q = db.from('jobber_visits').select('*').eq('status', 'complete').is('deleted_at', null)
    .gte('completed_at', start.toISOString()).lt('completed_at', end.toISOString()).eq('is_test', testOnly);
  const { data: visits } = await q;
  const common = { week_start: wk.week_start, payout_friday: wk.payout_friday, is_test: testOnly };
  const visitPayByPro = new Map<number, number>();
  for (const v of visits ?? []) {
    const team: number[] = (v.team_user_ids?.length ? v.team_user_ids : [v.connecteam_user_id]).filter(Boolean).map(Number);
    if (!team.length) { await alert(db, `pay_no_pro:${v.jobber_visit_id}`, 'Completed visit has no Pro', `${v.title} — set who did it on Pro Pay.`); continue; }
    let firstEstate = false;
    if (v.service_line === 'cleaning' && (v.size_tier ?? 0) >= 4) {
      const { count } = await db.from('jobber_visits').select('id', { count: 'exact', head: true }).eq('status', 'complete')
        .eq('address', v.address).gte('size_tier', 4).lt('completed_at', v.completed_at);
      firstEstate = (count ?? 0) === 0;
      if (v.size_tier === 5 && team.length < 2) await alert(db, `pay_estate_plus_solo:${v.jobber_visit_id}`, 'Estate Plus with one Pro', `${v.title} shows one Pro; Estate Plus pays $119 each to a team of two.`);
    }
    const teamBase = R.teamBaseCents(v.service_line, v.size_tier ?? 1, v.visit_kind ?? 'standard', firstEstate);
    let paidRedo = false;
    if (v.pay_outcome === 'redo' && v.user_id) {
      const since = new Date(new Date(v.completed_at).getTime() - R.REDO_WINDOW_DAYS * 86400000).toISOString();
      const { data: prior } = await db.from('pro_pay_lines').select('pay_cents, created_at').eq('kind', 'redo').eq('member_user_id', v.user_id)
        .gt('pay_cents', 0).gte('created_at', since).not('jobber_visit_id', 'eq', v.jobber_visit_id).limit(1);
      paidRedo = !!prior?.length;
      if (paidRedo) await alert(db, `pay_redo_cap:${v.jobber_visit_id}`, 'Second redo within 60 days paid $0', `${v.title}: this member already had a paid redo in the last 60 days.`);
    }
    const teamPay = R.outcomeCents(teamBase, v.pay_outcome ?? null, paidRedo);
    const shares = R.splitTeam(teamPay, team.length);
    const kind = v.pay_outcome ?? 'visit';
    const label = `${v.title}${firstEstate ? ' (first Estate visit, 1.5×)' : ''}${v.pay_outcome ? ` — ${v.pay_outcome.replace('_', ' ')} ${paidRedo ? '(2nd redo in 60 days, $0)' : '50%'}` : ''}${team.length > 1 ? ` — team of ${team.length}` : ''}`;
    for (let i = 0; i < team.length; i++) {
      await upsertLine(db, { ...common, line_key: `visit:${v.jobber_visit_id}:${team[i]}`, connecteam_user_id: team[i], kind, description: label,
        jobber_visit_id: v.jobber_visit_id, member_user_id: v.user_id, base_cents: teamBase, pay_cents: shares[i] });
      visitPayByPro.set(team[i], (visitPayByPro.get(team[i]) ?? 0) + shares[i]);
    }
    if (!v.pay_outcome) {
      const items: any[] = v.raw?.lineItems?.nodes ?? [];
      for (const [idx, it] of items.entries()) {
        if (BASE_NAMES.test(it.name ?? '') && !/Deep Clean/.test(it.name)) continue;
        const price = Math.round(Number(it.totalPrice || it.unitPrice || 0) * 100);
        const pay = R.addonCents(price); const parts = R.splitTeam(pay, team.length);
        if (!price) await alert(db, `pay_addon_no_price:${v.jobber_visit_id}:${idx}`, 'Add-on with $0 price', `${it.name} on ${v.title}: set its member price so the Pro gets 40% (gifted add-ons still pay).`);
        for (let i = 0; i < team.length; i++) {
          await upsertLine(db, { ...common, line_key: `addon:${v.jobber_visit_id}:${idx}:${team[i]}`, connecteam_user_id: team[i], kind: /Deep Clean/.test(it.name) ? 'deep_clean' : 'addon',
            description: `${it.name} — 40% of ${money(price)}`, jobber_visit_id: v.jobber_visit_id, member_user_id: v.user_id, base_cents: price, pay_cents: parts[i] });
          visitPayByPro.set(team[i], (visitPayByPro.get(team[i]) ?? 0) + parts[i]);
        }
      }
    }
  }
  // Tier 2 uplift (+10% of visit + add-on pay this week).
  for (const [ct, cents] of visitPayByPro) {
    const p = prof.get(ct);
    if (p?.tier2_since && new Date(p.tier2_since) < end && cents > 0)
      await upsertLine(db, { ...common, line_key: `tier2:${wk.week_start}:${ct}`, connecteam_user_id: ct, kind: 'tier2_uplift', description: 'Tier 2 Pro Partner +10%', base_cents: cents, pay_cents: R.tier2UpliftCents(cents) });
  }
  // Insurance reimbursement: $50 in each of the first three months after COI verification.
  for (const p of profiles ?? []) {
    if (!p.coi_verified_at) continue;
    for (const m of R.insuranceMonths(new Date(p.coi_verified_at))) {
      const due = new Date(Math.max(new Date(`${m}-01T12:00:00Z`).getTime(), new Date(p.coi_verified_at).getTime()));
      if (due >= start && due < end)
        await upsertLine(db, { ...common, line_key: `insurance:${p.connecteam_user_id}:${m}`, connecteam_user_id: p.connecteam_user_id, kind: 'insurance', description: `Insurance reimbursement ${m}`, pay_cents: R.INSURANCE_MONTHLY_CENTS });
    }
  }
  // Review bonuses decided (auto/approved) and not yet paid.
  const { data: revs } = await db.from('google_reviews').select('*').in('match_status', ['auto', 'approved']).is('bonus_paid_at', null);
  for (const r of revs ?? []) {
    if (!prof.has(Number(r.matched_ct_user_id))) continue;
    const { count } = await db.from('pro_pay_lines').select('id', { count: 'exact', head: true }).eq('kind', 'review_bonus').eq('member_user_id', r.member_user_id).neq('line_key', `review:${r.id}`);
    if ((count ?? 0) > 0) { await db.from('google_reviews').update({ match_status: 'ineligible', match_note: 'member already earned a review bonus' }).eq('id', r.id); continue; }
    await upsertLine(db, { ...common, line_key: `review:${r.id}`, connecteam_user_id: r.matched_ct_user_id, kind: 'review_bonus',
      description: `Five-star Google review from ${r.reviewer_name}`, member_user_id: r.member_user_id, pay_cents: R.REVIEW_BONUS_CENTS });
  }
  await tier2Check(db, testOnly);
  const { data: lines } = await db.from('pro_pay_lines').select('*').eq('week_start', wk.week_start).eq('is_test', testOnly).order('connecteam_user_id');
  const totals: Record<string, number> = {};
  for (const l of lines ?? []) totals[prof.get(Number(l.connecteam_user_id))?.name ?? String(l.connecteam_user_id)] = (totals[prof.get(Number(l.connecteam_user_id))?.name ?? String(l.connecteam_user_id)] ?? 0) + l.pay_cents;
  return { ...wk, lines: lines ?? [], totals };
}

async function tier2Check(db: SupabaseClient, testOnly: boolean) {
  const { data: profiles } = await db.from('pro_pay_profiles').select('*').is('tier2_since', null).eq('is_test', testOnly);
  for (const p of profiles ?? []) {
    const { data: vs } = await db.from('jobber_visits').select('rating').eq('status', 'complete').or(`connecteam_user_id.eq.${p.connecteam_user_id},team_user_ids.cs.{${p.connecteam_user_id}}`);
    const rated = (vs ?? []).filter((v: any) => v.rating != null);
    const avg = rated.length ? rated.reduce((s: number, v: any) => s + v.rating, 0) / rated.length : null;
    const days = Math.floor((Date.now() - new Date(p.started_on).getTime()) / 86400000);
    if (R.tier2Qualifies(vs?.length ?? 0, avg, days)) {
      await db.from('pro_pay_profiles').update({ tier2_since: new Date().toISOString() }).eq('connecteam_user_id', p.connecteam_user_id);
      if (!testOnly) await alert(db, `tier2:${p.connecteam_user_id}`, `${p.name} reached Tier 2 Pro Partner`, `${vs?.length} visits, ${avg?.toFixed(2)} rating, ${days} days. +10% applies from now.`);
    }
  }
}

async function matchReviews(db: SupabaseClient) {
  const { data: profiles } = await db.from('pro_pay_profiles').select('*').eq('is_test', false);
  const { data: revs } = await db.from('google_reviews').select('*').is('match_status', null).eq('is_seed', false);
  const { data: members } = await db.from('jobber_visits').select('user_id').eq('status', 'complete').not('user_id', 'is', null);
  const ids = [...new Set((members ?? []).map((m: any) => m.user_id))];
  const { data: mprof } = ids.length ? await db.from('profiles').select('user_id, first_name, last_name').in('user_id', ids) : { data: [] as any[] };
  const out: any[] = [];
  for (const r of revs ?? []) {
    let best: any = { status: 'ineligible', note: 'no Pro named' };
    for (const p of profiles ?? []) {
      const pm = R.proNameMatch(r.review_text ?? '', p.name);
      if (pm === 'none') continue;
      let mm: 'exact' | 'fuzzy' | 'none' = 'none'; let member: string | null = null;
      for (const m of mprof ?? []) { const x = R.memberNameMatch(r.reviewer_name ?? '', m.first_name ?? '', m.last_name ?? ''); if (x === 'exact' || (x === 'fuzzy' && mm === 'none')) { mm = x; member = m.user_id; } if (x === 'exact') break; }
      let paid = false;
      if (member) { const { count } = await db.from('pro_pay_lines').select('id', { count: 'exact', head: true }).eq('kind', 'review_bonus').eq('member_user_id', member); paid = (count ?? 0) > 0; }
      const status = R.reviewDecision(r.rating ?? 0, pm, mm, paid);
      if (status !== 'ineligible' || best.status === 'ineligible') best = { status, ct: p.connecteam_user_id, member, note: `pro ${pm}, member ${mm}${paid ? ', member already paid' : ''}` };
      if (status === 'auto') break;
    }
    await db.from('google_reviews').update({ match_status: best.status, matched_ct_user_id: best.ct ?? null, member_user_id: best.member ?? null, match_note: best.note, decided_at: best.status === 'auto' ? new Date().toISOString() : null }).eq('id', r.id);
    out.push({ id: r.id, ...best });
  }
  const pending = out.filter((o) => o.status === 'pending').length;
  if (pending) await alert(db, `review_pending:${new Date().toISOString().slice(0, 10)}`, `${pending} review bonus match${pending > 1 ? 'es' : ''} need your approval`, 'Open Pro Pay to approve or reject.');
  return out;
}

async function statements(db: SupabaseClient, weekStart: string, dryRun: boolean) {
  const built = await buildWeek(db, weekStart);
  const { data: profiles } = await db.from('pro_pay_profiles').select('*').eq('is_test', false);
  const year = built.week_start.slice(0, 4);
  const sent: any[] = [];
  for (const p of profiles ?? []) {
    const lines = built.lines.filter((l: any) => Number(l.connecteam_user_id) === Number(p.connecteam_user_id));
    if (!lines.length || !p.email) continue;
    const { data: ytdRows } = await db.from('pro_pay_lines').select('pay_cents').eq('connecteam_user_id', p.connecteam_user_id).eq('is_test', false).gte('week_start', `${year}-01-01`).lte('week_start', built.week_start);
    const ytd = (ytdRows ?? []).reduce((s: number, r: any) => s + r.pay_cents, 0);
    const total = lines.reduce((s: number, l: any) => s + l.pay_cents, 0);
    const es = String(p.language).startsWith('es');
    const rows = lines.map((l: any) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e6edf5">${esc(l.description)}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #e6edf5;white-space:nowrap">${money(l.pay_cents)}</td></tr>`).join('');
    const html = tidyEmailShell({
      heading: es ? 'Tu pago de la semana' : 'Your pay this week', eyebrow: 'Tidy Pro Pay', artTopic: 'pay',
      bodyHtml: `<p>${es ? `Hola ${esc(p.name.split(' ')[0])}, este es tu resumen del ${built.week_start} al ${built.week_end}. Se paga el viernes ${built.payout_friday}.` : `Hi ${esc(p.name.split(' ')[0])}, here is your statement for ${built.week_start} to ${built.week_end}. Paid Friday ${built.payout_friday}.`}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:14px/1.5 Arial,sans-serif;color:#0f172a">${rows}
        <tr><td style="padding:10px 0;font-weight:700">${es ? 'Total de la semana' : 'Week total'}</td><td align="right" style="padding:10px 0;font-weight:700">${money(total)}</td></tr>
        <tr><td style="padding:4px 0;color:#5b6b80">${es ? 'Total del año' : 'Year to date'}</td><td align="right" style="padding:4px 0;color:#5b6b80">${money(ytd)}</td></tr></table>
        <p style="color:#5b6b80">${es ? '¿Preguntas? Llama al (786) 829-1141.' : 'Questions? Call (786) 829-1141.'}</p>`,
    });
    if (dryRun) { sent.push({ pro: p.name, total, ytd, dry_run: true }); continue; }
    const res = await sendBrevoEmail({ to: [{ email: p.email, name: p.name }], marketing: false, subject: es ? `Tidy: tu pago ${built.payout_friday}` : `Tidy pay statement — ${built.payout_friday}`, htmlContent: html, tags: ['pro-pay-statement'], label: 'pro-pay-statement' });
    if (!res.sent) await alert(db, `pay_statement_fail:${p.connecteam_user_id}:${built.week_start}`, `Pay statement email failed: ${p.name}`, res.reason ?? 'unknown');
    sent.push({ pro: p.name, total, ytd, sent: res.sent });
  }
  return { week: built.week_start, payout_friday: built.payout_friday, sent };
}

async function testWeek(db: SupabaseClient) {
  const A = 999000001, B = 999000002;
  await db.from('pro_pay_profiles').upsert([
    { connecteam_user_id: A, name: 'ZZ Test Ana', email: null, is_test: true, started_on: '2026-08-01', coi_verified_at: '2026-10-27T15:00:00Z', tier2_since: '2026-10-01T00:00:00Z' },
    { connecteam_user_id: B, name: 'ZZ Test Beto', email: null, is_test: true, started_on: '2026-10-01' },
  ] as any, { onConflict: 'connecteam_user_id' });
  const wk = '2026-10-26'; const at = (d: number) => new Date(Date.UTC(2026, 9, 26 + d, 16)).toISOString();
  const member = '00000000-0000-4000-8000-00000000aaaa';
  const v = (id: string, d: number, o: Record<string, unknown>) => ({ jobber_visit_id: `ZZTEST-${id}`, status: 'complete', is_test: true, completed_at: at(d), start_at: at(d), end_at: at(d), connecteam_user_id: A, user_id: member, raw: { lineItems: { nodes: [] } }, ...o });
  await db.from('jobber_visits').upsert([
    v('clean2', 0, { title: 'House Cleaning — ZZ 1 Test St', service_line: 'cleaning', size_tier: 2, visit_kind: 'standard', address: 'ZZ1',
      raw: { lineItems: { nodes: [{ name: 'House Cleaning — Size 2', totalPrice: 189 }, { name: 'Inside Oven Clean', totalPrice: 45 }, { name: 'Deep Clean — Size 2', totalPrice: 179 }] } } }),
    v('estate', 1, { title: 'House Cleaning — ZZ 2 Estate Rd', service_line: 'cleaning', size_tier: 4, visit_kind: 'standard', address: 'ZZ2' }),
    v('estateplus', 2, { title: 'House Cleaning — ZZ 3 Estate Plus Rd', service_line: 'cleaning', size_tier: 5, visit_kind: 'standard', address: 'ZZ3', team_user_ids: [A, B] }),
    v('lawn3', 2, { title: 'Lawn Care — ZZ 4 Lawn Ave', service_line: 'lawn', size_tier: 3, visit_kind: 'standard', address: 'ZZ4', connecteam_user_id: B }),
    v('detail2', 3, { title: 'Car Care — ZZ 5 Car Ct', service_line: 'detailing', size_tier: 2, visit_kind: 'full_detail', address: 'ZZ5', connecteam_user_id: B }),
    v('lockout', 3, { title: 'House Cleaning — ZZ 6 Locked Ln', service_line: 'cleaning', size_tier: 1, visit_kind: 'standard', address: 'ZZ6', pay_outcome: 'lockout' }),
    v('redo1', 4, { title: 'House Cleaning — ZZ 1 Test St (redo)', service_line: 'cleaning', size_tier: 2, visit_kind: 'standard', address: 'ZZ1', pay_outcome: 'redo' }),
  ] as any, { onConflict: 'jobber_visit_id' });
  await db.from('pro_pay_lines').delete().eq('is_test', true).eq('week_start', wk);
  const first = await buildWeek(db, wk, true);
  // A second redo for the same member a day later must pay $0.
  await db.from('jobber_visits').upsert([v('redo2', 5, { title: 'House Cleaning — ZZ 1 Test St (redo 2)', service_line: 'cleaning', size_tier: 2, visit_kind: 'standard', address: 'ZZ1', pay_outcome: 'redo' })] as any, { onConflict: 'jobber_visit_id' });
  const built = await buildWeek(db, wk, true);
  void first;
  return { week_start: built.week_start, payout_friday: built.payout_friday, totals: built.totals,
    lines: built.lines.map((l: any) => ({ pro: l.connecteam_user_id === A ? 'Ana' : 'Beto', kind: l.kind, description: l.description, pay: money(l.pay_cents) })) };
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const body = await req.json().catch(() => ({}));
  const db = admin();
  const lastWeek = R.payWeek(new Date(Date.now() - 7 * 86400000)).week_start;
  try {
    switch (body.action) {
      case 'build_week': return jsonResponse({ ok: true, result: await buildWeek(db, body.week_start ?? lastWeek) });
      case 'match_reviews': return jsonResponse({ ok: true, result: await matchReviews(db) });
      case 'decide_review': {
        await db.from('google_reviews').update({ match_status: body.approve ? 'approved' : 'rejected', matched_ct_user_id: body.ct_user_id ?? undefined, decided_at: new Date().toISOString() }).eq('id', body.id);
        return jsonResponse({ ok: true });
      }
      case 'set_outcome': {
        await db.from('jobber_visits').update({ pay_outcome: body.outcome || null, ...(body.team_user_ids ? { team_user_ids: body.team_user_ids } : {}) }).eq('jobber_visit_id', body.jobber_visit_id);
        return jsonResponse({ ok: true });
      }
      case 'statements': { await matchReviews(db); return jsonResponse({ ok: true, result: await statements(db, body.week_start ?? lastWeek, !!body.dry_run) }); }
      case 'test_week': return jsonResponse({ ok: true, result: await testWeek(db) });
      default: return jsonResponse({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    const msg = (e as Error).message;
    await alert(db, `pro_pay_crash:${body.action}:${new Date().toISOString().slice(0, 13)}`, `Pro Pay (${body.action}) failed`, msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
