import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * pro-proof — public, token-only Equipment Proof page backend (/pro/proof/:token).
 *   load        → candidate first name, language, service, slots with status
 *   upload_url  → signed upload URL into the private pipeline-proof bucket
 *   confirm     → records the uploaded file for a slot (pending review)
 *   submit      → validates A (photos), B (videos), C (vehicle), D (work photos or reference)
 * A slot can be (re)uploaded only before first submit, or after Justin rejects it.
 * Never returns the business street address, never public URLs.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const BUCKET = 'pipeline-proof';
const MAX_BYTES = 60 * 1024 * 1024;
const WORK_SLOTS = ['work:1', 'work:2', 'work:3'];
const FAMILY = /\b(mom|mother|dad|father|parent|brother|sister|sibling|cousin|aunt|uncle|wife|husband|spouse|son|daughter|grand\w*|niece|nephew|in-law|stepmother|stepfather|family|familia|mam[aá]|madre|pap[aá]|padre|herman[oa]|prim[oa]|t[ií][oa]|espos[oa]|hij[oa]|abuel[oa]|sobrin[oa]|cuñad[oa]|suegr[oa]|novi[oa]|girlfriend|boyfriend|partner)\b/i;

type Slot = { slot: string; kind: string; label_en: string; label_es: string; sort: number };

async function loadByToken(token: string) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const { data: p } = await admin.from('contractor_pipeline').select('*').eq('proof_token', token).maybeSingle();
  if (!p) return null;
  const { data: a } = await admin.from('applicants').select('first_name').eq('id', p.applicant_id).maybeSingle();
  return { p, first: (a?.first_name ?? '').trim() };
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const rec = await loadByToken(body?.token);
  if (!rec) return jsonResponse({ error: 'not_found' }, 404);
  const { p, first } = rec;
  if (p.archived || p.state !== 'open') return jsonResponse({ error: 'closed' }, 410);
  if (p.stage !== 'proof' || p.proof_approved_at) return jsonResponse({ error: 'done' }, 410);
  if (!p.proof_token_expires_at || new Date(p.proof_token_expires_at).getTime() < Date.now()) return jsonResponse({ error: 'expired' }, 410);

  const { data: slotRows } = await admin.rpc('pipeline_proof_slots', { _service: p.service });
  const required = ((slotRows ?? []) as Slot[]).sort((x, y) => x.sort - y.sort);
  const { data: itemRows } = await admin.from('pipeline_proof_items').select('slot, status, reject_reason, reject_note, mime').eq('applicant_id', p.applicant_id);
  const items = new Map((itemRows ?? []).map((r) => [r.slot, r]));
  const submitted = !!p.proof_submitted_at;
  const editable = (slot: string) => {
    const it = items.get(slot);
    if (!submitted) return !it || it.status !== 'approved';
    return it?.status === 'rejected';
  };
  const allSlots = [...required.map((s) => s.slot), ...WORK_SLOTS];

  if (body.action === 'load') {
    const reopened = submitted && [...items.values()].some((i) => i.status === 'rejected');
    return jsonResponse({
      ok: true, first_name: first, service: p.service, lang: p.preferred_language === 'es' ? 'es' : 'en',
      experience_level: p.experience_level, submitted, reopened,
      slots: [...required, ...WORK_SLOTS.map((w, i) => ({ slot: w, kind: 'work', label_en: `Job photo ${i + 1}`, label_es: `Foto de trabajo ${i + 1}`, sort: 10000 + i }))]
        .map((s) => ({ ...s, status: items.get(s.slot)?.status ?? null, reject_reason: items.get(s.slot)?.reject_reason ?? null, reject_note: items.get(s.slot)?.reject_note ?? null, editable: editable(s.slot) })),
      reference: { name: p.ref_name, phone: p.ref_phone, relationship: p.ref_relationship, given: !!p.ref_name },
      reference_editable: !submitted || p.ref_status === 'not_confirmed',
    });
  }

  if (body.action === 'upload_url') {
    const slot = String(body.slot ?? '');
    if (!allSlots.includes(slot)) return jsonResponse({ error: 'unknown_slot' }, 400);
    if (!editable(slot)) return jsonResponse({ error: 'locked' }, 409);
    const mime = String(body.mime ?? '');
    const size = Number(body.size ?? 0);
    const isVideo = slot.startsWith('video:');
    if (isVideo ? !mime.startsWith('video/') : !mime.startsWith('image/')) return jsonResponse({ error: isVideo ? 'video_required' : 'photo_required' }, 400);
    if (!(size > 0) || size > MAX_BYTES) return jsonResponse({ error: 'too_large' }, 400);
    if (isVideo && Number(body.duration ?? 0) > 15.5) return jsonResponse({ error: 'too_long' }, 400);
    const ext = (mime.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
    const path = `${p.applicant_id}/${slot.replace(':', '_')}/${Date.now()}.${ext}`;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return jsonResponse({ error: 'upload_unavailable' }, 500);
    return jsonResponse({ ok: true, path, token: data.token, signed_url: data.signedUrl });
  }

  if (body.action === 'confirm') {
    const slot = String(body.slot ?? ''); const path = String(body.path ?? '');
    if (!allSlots.includes(slot) || !editable(slot)) return jsonResponse({ error: 'locked' }, 409);
    if (!path.startsWith(`${p.applicant_id}/${slot.replace(':', '_')}/`)) return jsonResponse({ error: 'bad_path' }, 400);
    const dir = path.slice(0, path.lastIndexOf('/')); const name = path.slice(path.lastIndexOf('/') + 1);
    const { data: listed } = await admin.storage.from(BUCKET).list(dir, { search: name });
    const obj = (listed ?? []).find((o) => o.name === name);
    if (!obj) return jsonResponse({ error: 'not_uploaded' }, 400);
    const { error } = await admin.from('pipeline_proof_items').upsert({
      applicant_id: p.applicant_id, slot, storage_path: path, mime: (obj.metadata as { mimetype?: string } | null)?.mimetype ?? null,
      size_bytes: (obj.metadata as { size?: number } | null)?.size ?? null, status: 'pending', reject_reason: null, reject_note: null,
      reviewed_at: null, reviewed_by: null, uploaded_at: new Date().toISOString(),
    }, { onConflict: 'applicant_id,slot' });
    if (error) return jsonResponse({ error: 'save_failed' }, 500);
    return jsonResponse({ ok: true });
  }

  if (body.action === 'submit') {
    // Reference (optional unless no experience).
    const ref = body.reference as { name?: string; phone?: string; relationship?: string; not_family?: boolean } | undefined;
    const refEditable = !submitted || p.ref_status === 'not_confirmed';
    let refGiven = !!p.ref_name;
    const patch: Record<string, unknown> = {};
    if (ref && refEditable && (ref.name || ref.phone || ref.relationship)) {
      const name = String(ref.name ?? '').trim(); const phone = String(ref.phone ?? '').replace(/\D/g, ''); const rel = String(ref.relationship ?? '').trim();
      if (name.length < 2 || phone.length < 10 || rel.length < 3) return jsonResponse({ error: 'reference_incomplete' }, 400);
      if (ref.not_family !== true || FAMILY.test(rel) || FAMILY.test(name)) return jsonResponse({ error: 'reference_family' }, 400);
      Object.assign(patch, { ref_name: name, ref_phone: phone, ref_relationship: rel, ref_status: 'pending', ref_notes: null });
      refGiven = true;
    }
    const missing = required.filter((s) => { const it = items.get(s.slot); return !it || it.status === 'rejected'; }).map((s) => s.slot);
    if (missing.length) return jsonResponse({ error: 'incomplete', missing }, 400);
    const work = WORK_SLOTS.filter((w) => { const it = items.get(w); return it && it.status !== 'rejected'; }).length;
    if (p.experience_level === 'none' && !refGiven) return jsonResponse({ error: 'reference_required' }, 400);
    if (work < 3 && !refGiven) return jsonResponse({ error: 'work_required' }, 400);
    patch.proof_submitted_at = new Date().toISOString();
    const { error } = await admin.from('contractor_pipeline').update(patch).eq('applicant_id', p.applicant_id);
    if (error) return jsonResponse({ error: 'save_failed' }, 500);
    await admin.from('contractor_stage_events').insert({ applicant_id: p.applicant_id, kind: 'message', from_stage: 'proof', to_stage: 'proof', reason: submitted ? 'proof resubmitted by candidate' : 'proof submitted by candidate' });
    await admin.from('admin_alerts').insert({
      alert_type: 'proof_submitted', level: 'action', category: 'hiring', tier: 'dashboard',
      title: `Equipment proof to review — ${first || 'candidate'}`, body: 'Open the Proof panel to approve or reject each item.',
      action_label: 'Review proof', action_url: `/admin/pipeline/${p.applicant_id}`,
      dedupe_key: `proof_submitted:${p.applicant_id}:${patch.proof_submitted_at}`, context: { applicant_id: p.applicant_id },
    }).then(() => null, () => null);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'unknown_action' }, 400);
});
