import '../_shared/http.ts';
// jobber-authorize-url — admin-only. Returns the Jobber OAuth consent URL for
// the "Reconnect Jobber" button on /admin. Also: action 'status' / 'introspect'
// for diagnostics (admin or service role only).
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { admin, gql, JOBBER_AUTHORIZE_URL } from '../_shared/jobber.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const db = admin();
  const redirect = `${Deno.env.get('SUPABASE_URL')}/functions/v1/jobber-oauth-callback`;

  if (body.action === 'status') {
    try {
      const d = await gql(db, '{ account { id name } }');
      return json({ connected: true, account: d.account });
    } catch (e) { return json({ connected: false, error: String((e as Error).message) }); }
  }
  if (body.action === 'introspect') {
    try {
      const d = await gql(db, `query($n:String!){ __type(name:$n){ name kind inputFields{ name type{ kind name ofType{ kind name ofType{ kind name ofType { name } } } } } fields{ name args{ name type{ kind name ofType{ kind name ofType{name} } } } type{ name kind ofType{name} } } enumValues{ name } } }`, { n: body.type });
      return json(d);
    } catch (e) { return json({ error: String((e as Error).message) }, 502); }
  }
  if (body.action === 'schema' && auth.kind === 'service_role') {
    // Recursively describe input types (and enums) reachable from the roots.
    const seen: Record<string, unknown> = {};
    const queue: string[] = [...(body.roots ?? [])];
    const q = `query($n:String!){ __type(name:$n){ name kind inputFields{ name type{ kind name ofType{ kind name ofType{ kind name ofType{ kind name } } } } } enumValues{ name } } }`;
    const unwrap = (t: any): any => (t?.ofType ? unwrap(t.ofType) : t);
    const show = (t: any): string => t.kind === 'NON_NULL' ? show(t.ofType) + '!' : t.kind === 'LIST' ? `[${show(t.ofType)}]` : t.name;
    while (queue.length && Object.keys(seen).length < 60) {
      const n = queue.shift()!; if (seen[n]) continue;
      const d: any = await gql(db, q, { n });
      const t = d.__type; if (!t) { seen[n] = null; continue; }
      if (t.kind === 'ENUM') { seen[n] = t.enumValues.map((e: any) => e.name); continue; }
      seen[n] = Object.fromEntries((t.inputFields ?? []).map((f: any) => [f.name, show(f.type)]));
      for (const f of t.inputFields ?? []) { const u = unwrap(f.type); if (u && (u.kind === 'INPUT_OBJECT' || u.kind === 'ENUM') && !seen[u.name]) queue.push(u.name); }
    }
    return json(seen);
  }
  if (body.action === 'gql' && auth.kind === 'service_role') {
    try { return json(await gql(db, body.query, body.variables ?? {})); }
    catch (e) { return json({ error: String((e as Error).message) }, 502); }
  }
  const state = crypto.randomUUID();
  await db.from('app_settings').upsert({ key: 'jobber_oauth_state', value: { state, at: new Date().toISOString() } } as any, { onConflict: 'key' });
  const url = `${JOBBER_AUTHORIZE_URL}?response_type=code&client_id=${encodeURIComponent(Deno.env.get('JOBBER_CLIENT_ID') ?? '')}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`;
  return json({ url, redirect_uri: redirect });
});
