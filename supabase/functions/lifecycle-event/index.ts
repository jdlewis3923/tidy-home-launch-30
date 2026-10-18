// Tidy — lifecycle stage transitions.
//
// One door for "this contact just did something": upserts the contact and
// moves them to a new stage. lifecycle_set_stage cancels the old stage's
// queued messages and queues the new stage's steps.
//
// Body: { email?, phone?, first_name?, last_name?, zip?, lang?, source?,
//         src_tag?, sms_service?, sms_marketing?, stage, tokens? }
// Auth: service-role bearer or admin user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().min(7).max(32).optional(),
  first_name: z.string().trim().max(80).optional(),
  last_name: z.string().trim().max(80).optional(),
  zip: z.string().trim().max(10).optional(),
  lang: z.enum(['en', 'es']).optional(),
  source: z.string().trim().max(64).optional(),
  src_tag: z.string().trim().max(64).optional(),
  sms_service: z.boolean().optional(),
  sms_marketing: z.boolean().optional(),
  stage: z.string().trim().min(1).max(40),
  tokens: z.record(z.unknown()).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = req.headers.get('authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });

  let isAdmin = auth === `Bearer ${serviceKey}`;
  if (!isAdmin && auth.startsWith('Bearer ')) {
    const { data } = await admin.auth.getUser(auth.slice(7));
    if (data?.user) {
      const { data: role } = await admin.rpc('has_role', { _user_id: data.user.id, _role: 'admin' });
      isAdmin = role === true;
    }
  }
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.email && !parsed.data.phone)) {
    return new Response(JSON.stringify({ error: 'validation_failed', details: parsed.success ? 'email or phone required' : parsed.error.flatten() }), { status: 400, headers: corsHeaders });
  }
  const b = parsed.data;

  // Find existing contact by email or phone.
  let contactId: string | null = null;
  if (b.email) {
    const { data } = await admin.from('contacts').select('id').ilike('email', b.email).maybeSingle();
    contactId = data?.id ?? null;
  }
  if (!contactId && b.phone) {
    const { data } = await admin.from('contacts').select('id').eq('phone', b.phone).maybeSingle();
    contactId = data?.id ?? null;
  }

  const fields: Record<string, unknown> = {};
  for (const k of ['email', 'phone', 'first_name', 'last_name', 'zip', 'lang', 'source', 'src_tag'] as const) {
    if (b[k] !== undefined) fields[k] = b[k];
  }
  if (b.sms_service !== undefined) fields.sms_service = b.sms_service;
  if (b.sms_marketing !== undefined) fields.sms_marketing = b.sms_marketing;

  if (contactId) {
    await admin.from('contacts').update(fields).eq('id', contactId);
  } else {
    const { data, error } = await admin.from('contacts').insert(fields).select('id').single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
    contactId = data.id;
  }

  const { error: stageErr } = await admin.rpc('lifecycle_set_stage', {
    _contact_id: contactId,
    _stage: b.stage,
    _tokens: b.tokens ?? {},
  });
  if (stageErr) {
    return new Response(JSON.stringify({ error: stageErr.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true, contact_id: contactId, stage: b.stage }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
