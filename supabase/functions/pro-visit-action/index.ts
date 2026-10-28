// Tidy — Pro visit actions: "on my way" and "complete visit".
//
// Every rule that matters is enforced HERE, server-side, not in the UI:
//   - the visit must be assigned to the calling Pro
//   - COI must be on file and unexpired (pro_coi_state.can_work)
//   - complete requires >= 1 before photo AND >= 1 after photo
//   - on_my_way stamps on_my_way_at and texts the customer via send-twilio-sms
//   - complete stamps completed_at, rolls the week's payout_weeks row and
//     increments the Pro's completed visit count
//
// GPS: check_in (arrival) and complete (check-out) stamp the Pro's location;
// a DB trigger refuses to close a visit without both plus before/after photos.
// First cleaning/car visit: the Pro records the real size (size_check);
// a mismatch lands in /admin/size-review — the Pro still does the booked size.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { readEnv, missingEnvError } from '../_shared/handlerEnv.ts';
import { PRO_REPORTABLE_PAID_IN_FULL_REASONS } from '../_shared/pricing-canon.ts';
import { vendorFetch } from '../_shared/http.ts';
import { afterVisitComplete, maybePromoteProPartner } from '../_shared/member-followups.ts';
import { recomputeSize } from '../_shared/size-validation.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { creditFirstVisitReferral } from '../_shared/lifecycle-referral.ts';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

// 'blocked': the pro arrived and could not work through no fault of their own.
// Canon pays it in full. Only the two pro-reportable reasons are accepted here,
// a note is mandatory, and on_my_way must already have been sent — every case
// is written to admin_alerts for review.
const Gps = { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) };
const BodySchema = z.discriminatedUnion('action', [
  z.object({ visit_id: z.string().uuid(), action: z.literal('on_my_way'), eta_minutes: z.number().int().min(5).max(120).optional() }),
  z.object({ visit_id: z.string().uuid(), action: z.literal('check_in'), ...Gps, location_reason: z.string().trim().max(500).optional() }),
  z.object({ visit_id: z.string().uuid(), action: z.literal('team_check_out'), ...Gps, location_reason: z.string().trim().max(500).optional() }),
  z.object({ visit_id: z.string().uuid(), action: z.literal('complete'), ...Gps, location_reason: z.string().trim().max(500).optional(), not_reached_note: z.string().trim().max(1000).optional() }),
  z.object({
    visit_id: z.string().uuid(),
    action: z.literal('size_check'),
    bedrooms: z.number().int().min(0).max(20).optional(),
    bathrooms: z.number().min(0).max(20).optional(),
    sq_ft: z.number().int().min(1).max(100000).optional(),
    vehicle_class: z.enum(['sedan', 'coupe', 'suv', 'crossover', 'truck', 'suv3row', 'van']).optional(),
    plate: z.string().trim().max(15).optional(),
  }),
  z.object({
    visit_id: z.string().uuid(),
    action: z.literal('blocked'),
    reason: z.enum(PRO_REPORTABLE_PAID_IN_FULL_REASONS as [string, ...string[]]),
    note: z.string().trim().min(10).max(500),
  }),
]);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const env = readEnv(REQUIRED_ENV);
  if (req.method === 'GET') {
    return jsonResponse({ ok: env.missing.length === 0, function: 'pro-visit-action', missing_env: env.missing });
  }
  if (env.missing.length) return jsonResponse({ ok: false, error: missingEnvError(env.missing) });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' });

  try {
    console.log('[pro-visit-action] entry');
    const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse({ ok: false, error: 'unauthorized' });
    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return jsonResponse({ ok: false, error: 'unauthorized' });

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body' });
    const { visit_id, action } = parsed.data;

    const { data: visit } = await admin
      .from('visits')
      .select('id, assigned_pro_id, status, user_id, subscription_id, service_type, visit_kind, size_tier, visit_pay_cents, contractor_pay_cents, scheduled_start, on_my_way_at, check_in_at, street, customer_first_name, rate_token, is_redo, redo_request_id, cleaning_team_id, backup_pro_id, pro_loop_enabled')
      .eq('id', visit_id)
      .maybeSingle();
    const {data:team} = visit?.cleaning_team_id ? await admin.from('cleaning_teams').select('kind,partner_pro_id,active').eq('id',visit.cleaning_team_id).maybeSingle() : {data:null};
    const isPartner=visit?.backup_pro_id===uid || (team?.active && team.kind==='paired_pros' && team.partner_pro_id===uid);
    if (!visit || (visit.assigned_pro_id !== uid && !isPartner)) {
      return jsonResponse({ ok: false, error: 'visit_not_assigned_to_you' });
    }
    if(isPartner && !['check_in','team_check_out'].includes(action)) return jsonResponse({ok:false,error:'lead_action_required'});
    if (['complete', 'canceled', 'blocked', 'skipped'].includes(visit.status ?? '')) {
      return jsonResponse({ ok: false, error: 'visit_not_open', status: visit.status });
    }

    // COI gate — viewing is fine, working is not.
    const { data: coi } = await admin.rpc('pro_coi_state', { _pro: uid });
    const coiRow = Array.isArray(coi) ? coi[0] : coi;
    if (!coiRow?.can_work) {
      return jsonResponse({ ok: false, error: 'coi_blocked', coi_status: coiRow?.status ?? 'none' });
    }

    if (visit.pro_loop_enabled && (parsed.data.action === 'check_in' || parsed.data.action === 'team_check_out' || parsed.data.action === 'complete')) {
      const {data:location,error:locationError}=await admin.rpc('pro_gps_validate',{_visit:visit_id,_pro:uid,_lat:parsed.data.lat,_lng:parsed.data.lng,_reason:parsed.data.location_reason??null});
      if(locationError || !location?.ok) return jsonResponse({ok:false,error:locationError?.message??location?.error??'invalid_location'});
      if(parsed.data.location_reason) {
        await writeAlert(admin,{level:'action',category:'operations',title:'Pro location exception',body:parsed.data.location_reason,dedupe_key:`location:${visit_id}:${uid}:${action}`,context:{visit_id,pro_id:uid,action},action_url:'/admin/schedule'});
      }
    }

    if (action === 'on_my_way') {
      await admin
        .from('visits')
        .update({ on_my_way_at: new Date().toISOString(), status: 'on_the_way' })
        .eq('id', visit_id);

      let sms: string = 'skipped_no_phone';
      const { data: profile } = await admin
        .from('profiles')
        .select('phone, first_name, language')
        .eq('user_id', visit.user_id)
        .maybeSingle();
      // "[Pro first name] is on the way, about [ETA] minutes." — in the member's language.
      const eta = (parsed.data as { eta_minutes?: number }).eta_minutes;
      const { data: proName } = await admin.rpc('sched_pro_first_name', { _uid: uid });
      const who = String(proName ?? '').trim() || 'Your Tidy Pro';
      const es = String(profile?.language ?? '').trim() === 'es';
      const omwText = es
        ? `${who === 'Your Tidy Pro' ? 'Su Pro de Tidy' : who} va en camino${eta ? `, llega en unos ${eta} minutos` : ''}.`
        : `${who} is on the way${eta ? `, about ${eta} minutes` : ''}.`;
      await admin.from('member_notifications').insert({
        user_id: visit.user_id, kind: 'pro_on_the_way', related_visit_id: visit_id,
        title: es ? 'Su Pro va en camino' : 'Your Pro is on the way', body: omwText, dedupe_key: `omw:${visit_id}`,
      }).then(() => {}, () => {});
      if (profile?.phone) {
        const to = profile.phone.startsWith('+') ? profile.phone : `+1${profile.phone.replace(/\D/g, '')}`;
        const res = await vendorFetch(`${env.values.SUPABASE_URL}/functions/v1/send-twilio-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.values.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            to_phone_e164: to,
            body: `Tidy: ${omwText}`,
            idempotency_key: `omw:${visit_id}`,
            template_name: 'pro_on_my_way',
            triggered_by: 'pro-visit-action',
            // "On my way" is only true for the next few hours.
            expires_at: new Date(Date.now() + 4 * 3_600_000).toISOString(),
          }),
        });
        const out = await res.json().catch(() => ({}));
        // 202 means parked for the next window, not delivered. Reporting a
        // parked text as "sent" is how a never-arriving heads-up looked fine.
        sms = res.status === 202
          ? 'queued_for_send_window'
          : out?.ok === false ? `sms_failed:${out?.error ?? 'unknown'}` : 'sent';
      }
      return jsonResponse({ ok: true, action, sms });
    }

    if (action === 'check_in') {
      const { lat, lng } = parsed.data;
      if(visit.service_type==='cleaning'){
        const {error}= visit.pro_loop_enabled ? await admin.rpc('pro_record_team_location',{_visit:visit_id,_pro:uid,_action:'check_in',_lat:lat,_lng:lng,_reason:parsed.data.location_reason??null}) : await admin.rpc('cleaning_team_presence_record',{_visit:visit_id,_pro:uid,_action:'check_in',_lat:lat,_lng:lng});
        if(error)return jsonResponse({ok:false,error:error.message});
        if(isPartner)return jsonResponse({ok:true,action});
      }
      const { error } = await admin.from('visits').update({
        check_in_at: visit.check_in_at ?? new Date().toISOString(), check_in_lat: lat, check_in_lng: lng,
        check_in_location_reason: parsed.data.location_reason ?? null,
        status: 'in_progress',
      }).eq('id', visit_id);
      if (error) return jsonResponse({ ok: false, error: error.message });
      return jsonResponse({ ok: true, action });
    }
    if(action==='team_check_out'){
      const {lat,lng}=parsed.data;
      const {error}=visit.pro_loop_enabled ? await admin.rpc('pro_record_team_location',{_visit:visit_id,_pro:uid,_action:'check_out',_lat:lat,_lng:lng,_reason:parsed.data.location_reason??null}) : await admin.rpc('cleaning_team_presence_record',{_visit:visit_id,_pro:uid,_action:'check_out',_lat:lat,_lng:lng});
      return jsonResponse(error?{ok:false,error:error.message}:{ok:true,action});
    }

    if (action === 'size_check') {
      const d = parsed.data;
      const svc = visit.service_type === 'cleaning' ? 'cleaning' : visit.service_type === 'detailing' ? 'detailing' : null;
      if (!svc) return jsonResponse({ ok: false, error: 'size_check_not_needed' });
      const observed = svc === 'cleaning'
        ? recomputeSize('cleaning', { home_sq_ft: d.sq_ft ?? null, bathrooms: d.bathrooms ?? null })
        : recomputeSize('detailing' as never, { vehicle_class: d.vehicle_class ?? null });
      if (observed == null || observed === 'quote' && svc === 'detailing') return jsonResponse({ ok: false, error: 'size_inputs_required' });
      if (svc === 'detailing' && !d.plate) return jsonResponse({ ok: false, error: 'plate_required' });
      const booked = visit.size_tier ?? null;
      const observedNum = observed === 'quote' ? 99 : Number(observed);
      const matches = booked != null && observedNum <= booked;
      const { error } = await admin.from('size_reviews').upsert({
        visit_id, user_id: visit.user_id, subscription_id: visit.subscription_id, service: svc,
        booked_size: booked, observed_bedrooms: d.bedrooms ?? null, observed_bathrooms: d.bathrooms ?? null, observed_sq_ft: d.sq_ft ?? null,
        observed_vehicle_class: d.vehicle_class ?? null, observed_plate: d.plate ?? null,
        observed_size: observed === 'quote' ? null : observedNum, matches, status: matches ? 'recorded' : 'open',
      }, { onConflict: 'visit_id' });
      if (error) return jsonResponse({ ok: false, error: error.message });
      if (!matches) {
        await writeAlert(admin, {
          level: 'action', category: 'operations',
          title: `Size mismatch at a first visit · ${visit.customer_first_name ?? 'Member'}`,
          body: `Booked size ${booked ?? '?'}, Pro recorded ${observed === 'quote' ? 'custom-quote size' : `size ${observedNum}`}. The Pro does the booked size today. Nothing is repriced until the member confirms.`,
          action_label: 'Open size review', action_url: '/admin/size-review', dedupe_key: `size_review:${visit_id}`, context: { visit_id },
        });
      }
      return jsonResponse({ ok: true, action, matches });
    }

    if (action === 'blocked') {
      if (!visit.on_my_way_at) return jsonResponse({ ok: false, error: 'on_my_way_required' });
      const { reason, note } = parsed.data;
      // Evidence first: the DB trigger requires photos + GPS check-in and, for
      // no access, a 15-minute wait from check-in before this can be recorded.
      const outcome = reason === 'unsafe_conditions' ? 'unsafe' : 'no_access';
      const { error: outErr } = await admin.from('visits').update({ visit_outcome: outcome, outcome_reason: note }).eq('id', visit_id);
      if (outErr) return jsonResponse({ ok: false, error: outErr.message.replace(/^.*?(\w+_required|wait_15_minutes).*$/, '$1') });
      const { data: result, error: rpcErr } = await admin.rpc('mark_visit_paid_in_full', {
        _visit_id: visit_id,
        _reason: reason,
        _note: note,
        _actor: `pro:${uid}`,
      });
      if (rpcErr) {
        await admin.from('visits').update({ visit_outcome: null, outcome_reason: null }).eq('id', visit_id);
        return jsonResponse({ ok: false, error: rpcErr.message });
      }
      // Tell the member why, in their language (write-first; member-ops-tick emails it).
      const { data: prof } = await admin.from('profiles').select('language').eq('user_id', visit.user_id).maybeSingle();
      const es = String(prof?.language ?? '').trim() === 'es';
      const why = outcome === 'unsafe'
        ? (es ? 'Su Pro tuvo que detenerse porque encontró una condición insegura. Tomó fotos y se retiró.' : 'Your Pro had to stop because of an unsafe condition. They took photos and left.')
        : (es ? 'Su Pro no pudo entrar. Le escribimos, esperamos 15 minutos y tomamos fotos con hora y ubicación.' : "Your Pro couldn't get in. We messaged you, waited 15 minutes and took timestamped photos.");
      await admin.from('member_notifications').insert({
        user_id: visit.user_id, kind: 'visit_no_access', related_visit_id: visit_id,
        title: es ? 'Visita completada — sin acceso' : 'Visit completed — no access',
        body: `${why} ${es ? 'La visita cuenta como realizada y no se acredita ni se reprograma. Vea «Así funcionan las visitas» en su cuenta.' : 'The visit counts as delivered and is not credited or rescheduled. See "How visits work" on your Account page.'} ${es ? 'Nota del Pro' : "Pro's note"}: ${note}`,
        dedupe_key: `no_access:${visit_id}`,
      }).then(() => {}, () => {});
      await admin.from('visits').update({ customer_told_at: new Date().toISOString() }).eq('id', visit_id);
      if (outcome === 'unsafe') {
        await writeAlert(admin, {
          level: 'critical', category: 'operations', title: `Pro stopped a visit — unsafe · ${visit.customer_first_name ?? 'Member'}`,
          body: note, action_label: 'Open visit photos', action_url: '/admin/photos', dedupe_key: `unsafe:${visit_id}`, context: { visit_id },
        });
      }
      const out = result as { visit_pay_cents?: number } | null;
      const {data:actorPay}=visit.service_type==='cleaning'?await admin.rpc('cleaning_pro_visit_pay',{_visit:visit_id,_pro:uid}):{data:out?.visit_pay_cents};
      return jsonResponse({ ok: true, action, paid_in_full_reason: reason, visit_pay_cents: actorPay ?? 0 });
    }

    // action === 'complete'
    const { count: before } = await admin
      .from('visit_photos')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', visit_id)
      .eq('kind', 'before');
    const { count: after } = await admin
      .from('visit_photos')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', visit_id)
      .eq('kind', 'after');
    if (!before || !after) {
      return jsonResponse({
        ok: false,
        error: 'photos_required',
        before_photos: before ?? 0,
        after_photos: after ?? 0,
      });
    }

    // First cleaning/car visit: the real size must be recorded before closing.
    if (!visit.is_redo && (visit.service_type === 'cleaning' || visit.service_type === 'detailing')) {
      const { count: priorDone } = await admin.from('visits').select('id', { count: 'exact', head: true })
        .eq('user_id', visit.user_id).eq('service_type', visit.service_type).eq('status', 'complete').neq('id', visit_id);
      if (!priorDone) {
        const { data: sc } = await admin.from('size_reviews').select('id').eq('visit_id', visit_id).maybeSingle();
        if (!sc) return jsonResponse({ ok: false, error: 'size_check_required' });
      }
    }

    // Pay = frozen Tier 1 base (contractor_pay_cents) + the uplift for the tier
    // this pro holds RIGHT NOW. The base never moves; the tier is the pro's.
    let pay = visit.visit_pay_cents ?? 0;
    if (visit.contractor_pay_cents != null) {
      const { data: resolved } = await admin.rpc('pro_tier_uplift_cents', {
        _base_cents: visit.contractor_pay_cents,
        _pro_uid: uid,
      });
      if (typeof resolved === 'number') pay = resolved;
    }

    const now = new Date();
    const { lat, lng, not_reached_note } = parsed.data as { lat: number; lng: number; not_reached_note?: string };
    if(visit.service_type==='cleaning' && team?.kind==='paired_pros'){
      const {error}=visit.pro_loop_enabled ? await admin.rpc('pro_record_team_location',{_visit:visit_id,_pro:uid,_action:'check_out',_lat:lat,_lng:lng,_reason:'location_reason' in parsed.data?parsed.data.location_reason??null:null}) : await admin.rpc('cleaning_team_presence_record',{_visit:visit_id,_pro:uid,_action:'check_out',_lat:lat,_lng:lng});
      if(error)return jsonResponse({ok:false,error:error.message});
    }
    const { data: closedVisit, error: closeErr } = await admin
      .from('visits')
      .update({
        completed_at: now.toISOString(), status: 'complete', visit_pay_cents: pay,
        check_out_at: now.toISOString(), check_out_lat: lat, check_out_lng: lng,
        check_out_location_reason: 'location_reason' in parsed.data ? parsed.data.location_reason ?? null : null,
        not_reached_note: not_reached_note || null,
      })
      .eq('id', visit_id).in('status', ['scheduled','on_the_way','in_progress']).select('id').maybeSingle();
    // The DB refuses to close without before/after photos and GPS check-in/out.
    if (closeErr) {
      const code = /(before_photos_required|after_photos_required|gps_check_in_required|gps_check_out_required)/.exec(closeErr.message)?.[1];
      return jsonResponse({ ok: false, error: code ?? closeErr.message });
    }
    if (!closedVisit) return jsonResponse({ok:false,error:'visit_not_open'});

    // Opted-in photo report: tell the member their visit photos are ready.
    // Photos themselves auto-delete after 30 days (visit-photo-retention).
    try {
      const { data: prof } = await admin.from('profiles').select('photo_reports_opt_in').eq('user_id', visit.user_id).maybeSingle();
      if (prof?.photo_reports_opt_in) {
        await admin.from('member_notifications').insert({
          user_id: visit.user_id,
          kind: 'photo_report',
          title: 'Your visit photo report is ready',
          body: 'Your Pro\'s before-and-after photos from today\'s visit are in your Tidy dashboard. They\'re kept for 30 days, then deleted.',
          dedupe_key: `photo-report-${visit_id}`,
          related_visit_id: visit_id,
        });
      }
    } catch (err) {
      console.error('[pro-visit-action] photo report notice failed', err);
    }
    if(visit.service_type==='cleaning'){
      const {data:actorPay}=await admin.rpc('cleaning_pro_visit_pay',{_visit:visit_id,_pro:uid});
      if(typeof actorPay==='number')pay=actorPay;
    }

    // Roll this Pro's payout week (Monday-Sunday, paid the following Friday).
    const { error: creditErr } = visit.service_type === 'cleaning'
      ? await admin.rpc('cleaning_record_pay', { _visit: visit_id })
      : await admin.rpc('credit_payout_week', { _pro: uid, _at: visit.scheduled_start ?? now.toISOString(), _cents: pay });
    if (creditErr) console.error('[pro-visit-action] payout credit failed', creditErr.message);

    const { data: applicant } = await admin
      .from('applicants')
      .select('id, completed_visits')
      .eq('contractor_id', uid)
      .maybeSingle();
    // A 48-hour-guarantee return visit closes its Redo task and never counts
    // toward Pro Partner or the member's review/referral timing.
    if (visit.is_redo) {
      if (visit.redo_request_id) {
        await admin.from('redo_requests').update({ status: 'completed', resolved_at: now.toISOString() }).eq('id', visit.redo_request_id);
      }
      if (applicant) await admin.from('applicants').update({ last_visit_at: now.toISOString() }).eq('id', applicant.id);
      return jsonResponse({ ok: true, action, visit_pay_cents: pay, redo: true });
    }

    if (applicant && visit.service_type !== 'cleaning') {
      await admin
        .from('applicants')
        .update({ completed_visits: (applicant.completed_visits ?? 0) + 1, last_visit_at: now.toISOString() })
        .eq('id', applicant.id);
    }

    const followups = await afterVisitComplete(admin, { id: visit.id, user_id: visit.user_id, rate_token: visit.rate_token, service_type: visit.service_type }, now);
    await creditFirstVisitReferral(admin, visit.user_id);
    // Pro Partner: applies automatically, no approval — the raise starts on the next visit.
    const proPartner = applicant ? await maybePromoteProPartner(admin, applicant.id) : null;

    return jsonResponse({ ok: true, action, visit_pay_cents: pay, followups, pro_partner: proPartner });
  } catch (e) {
    console.error('[pro-visit-action] failed', (e as Error).message);
    return jsonResponse({ ok: false, error: (e as Error).message });
  }
});
