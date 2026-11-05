import '../_shared/http.ts';
// jobber-sync — temporary introspection entry (replaced below once schema is known).
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { admin, gql } from '../_shared/jobber.ts';

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const body = await req.json().catch(() => ({}));
  const db = admin();
  try {
    if (body.action === 'gql') return jsonResponse(await gql(db, body.query, body.variables ?? {}));
    const names: string[] = body.types ?? [];
    const out: Record<string, unknown> = {};
    for (const n of names) {
      const d = await gql(db, `query($n:String!){__type(name:$n){kind name inputFields{name type{kind name ofType{kind name ofType{kind name ofType{name}}}}} fields{name args{name type{kind name ofType{kind name ofType{name}}}} type{kind name ofType{kind name ofType{name}}}} enumValues{name}}}`, { n });
      out[n] = d.__type;
    }
    return jsonResponse(out);
  } catch (e) { return jsonResponse({ error: String((e as Error).message) }, 500); }
});
