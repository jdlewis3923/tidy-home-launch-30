// Wraps a candidate-facing function's Deno.serve handler so every non-OK response
// (and every crash) is logged and raises an urgent alert naming the candidate.
// Call reportCandidateSurface('<surface>') once, before the file's Deno.serve(...).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { reportCandidateFailure, type CandidateFailure } from './candidate-failure.ts';

const BENIGN_STATUS = new Set([401, 405]);

export function reportCandidateSurface(surface: CandidateFailure['surface']) {
  const original = Deno.serve.bind(Deno);
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (...args: any[]) => {
    const i = args.findIndex((a) => typeof a === 'function');
    const handler = args[i] as (req: Request, info?: unknown) => Response | Promise<Response>;
    args[i] = async (req: Request, info?: unknown) => {
      let body: Record<string, unknown> = {};
      if (req.method === 'POST') body = await req.clone().json().catch(() => ({}));
      let res: Response;
      try {
        res = await handler(req, info);
      } catch (e) {
        await report(surface, body, `exception:${e instanceof Error ? e.message : String(e)}`, 500, req);
        throw e;
      }
      if (res.status >= 400 && !BENIGN_STATUS.has(res.status)) {
        const out = await res.clone().json().catch(() => ({}));
        await report(surface, body, String(out?.error ?? out?.message ?? `http_${res.status}`), res.status, req);
      }
      return res;
    };
    return original(...args);
  };
}

async function report(surface: CandidateFailure['surface'], body: Record<string, unknown>, reason: string, status: number, req: Request) {
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
  const s = (k: string) => (typeof body?.[k] === 'string' ? (body[k] as string) : null);
  await reportCandidateFailure(db, {
    surface, reason, status,
    applicantId: s('applicant_id') && /^[0-9a-f-]{36}$/i.test(s('applicant_id')!) ? s('applicant_id') : null,
    token: s('contract_token'),
    detail: { action: s('action'), phone_tail: (s('phone') ?? '').replace(/\D/g, '').slice(-4) || null, ua: (req.headers.get('user-agent') ?? '').slice(0, 160) },
  });
}
