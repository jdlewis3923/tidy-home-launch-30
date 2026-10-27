import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — visit-photo-retention.
//
// The Member Guide promises visit photo reports are deleted after 30 days.
// This daily job enforces it:
//   1. visit_photos older than 30 days are deleted (storage object + row),
//      EXCEPT photos on a visit with an open or under-review damage claim.
//   2. Member-uploaded claim photos are deleted 30 days after the claim closes.
// Every run is logged to integration_logs so the Health page can see it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RETENTION_DAYS = 30;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (!(await isCronAuthorized(req))) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result: Record<string, unknown> = { cutoff };

  try {
    // ---------- 1. visit photos older than 30 days ----------
    const { data: oldPhotos, error: photoErr } = await admin
      .from('visit_photos')
      .select('id, visit_id, storage_path')
      .lt('uploaded_at', cutoff)
      .limit(500);
    if (photoErr) throw new Error(`visit_photos read failed: ${photoErr.message}`);

    // Visits with an unresolved claim keep their photos until the claim closes.
    const visitIds = [...new Set((oldPhotos ?? []).map((p) => p.visit_id))];
    const claimedVisits = new Set<string>();
    for (let i = 0; i < visitIds.length; i += 100) {
      const { data: claims } = await admin
        .from('damage_claims')
        .select('visit_id')
        .in('visit_id', visitIds.slice(i, i + 100))
        .in('status', ['open', 'reviewing']);
      for (const c of claims ?? []) claimedVisits.add(c.visit_id);
    }

    const deletable = (oldPhotos ?? []).filter((p) => !claimedVisits.has(p.visit_id));
    let visitPhotosDeleted = 0;
    if (deletable.length > 0) {
      const paths = deletable.map((p) => p.storage_path);
      const { error: storageErr } = await admin.storage.from('visit-photos').remove(paths);
      if (storageErr) throw new Error(`visit-photos storage delete failed: ${storageErr.message}`);
      const { error: rowErr } = await admin
        .from('visit_photos')
        .delete()
        .in('id', deletable.map((p) => p.id));
      if (rowErr) throw new Error(`visit_photos row delete failed: ${rowErr.message}`);
      visitPhotosDeleted = deletable.length;
    }
    result.visit_photos_deleted = visitPhotosDeleted;
    result.visit_photos_kept_for_open_claims = (oldPhotos ?? []).length - deletable.length;

    // ---------- 2. claim photos, 30 days after the claim closes ----------
    const { data: closedClaims, error: claimErr } = await admin
      .from('damage_claims')
      .select('id, photo_paths')
      .eq('status', 'closed')
      .lt('closed_at', cutoff)
      .is('photos_purged_at', null)
      .limit(200);
    if (claimErr) throw new Error(`damage_claims read failed: ${claimErr.message}`);

    const claimPaths = (closedClaims ?? []).flatMap((c) => c.photo_paths ?? []);
    let claimPhotosDeleted = 0;
    if (closedClaims && closedClaims.length > 0) {
      if (claimPaths.length > 0) {
        const { error: claimStorageErr } = await admin.storage.from('claim-photos').remove(claimPaths);
        if (claimStorageErr) throw new Error(`claim-photos storage delete failed: ${claimStorageErr.message}`);
        claimPhotosDeleted = claimPaths.length;
      }
      // Mark purged so the next run does not reprocess them.
      const { error: purgeErr } = await admin
        .from('damage_claims')
        .update({ photos_purged_at: new Date().toISOString() })
        .in('id', closedClaims.map((c) => c.id));
      if (purgeErr) throw new Error(`damage_claims purge mark failed: ${purgeErr.message}`);
    }
    result.claim_photos_deleted = claimPhotosDeleted;

    await admin.from('integration_logs').insert({
      source: 'internal',
      event: 'visit_photo_retention',
      status: 'ok',
      detail: JSON.stringify(result),
    });

    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    await admin.from('integration_logs').insert({
      source: 'internal',
      event: 'visit_photo_retention',
      status: 'error',
      detail: message,
    });
    return jsonResponse({ ok: false, error: message, ...result }, 500);
  }
});
