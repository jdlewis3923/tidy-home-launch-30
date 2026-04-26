// Tidy — Shared CORS preamble for all edge functions.
//
// Usage:
//   import { corsHeaders, handleCors } from '../_shared/cors.ts';
//   const pre = handleCors(req); if (pre) return pre;
//   ...
//   return new Response(JSON.stringify(data), {
//     headers: { ...corsHeaders, 'Content-Type': 'application/json' },
//   });

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
};

/**
 * If the request is an OPTIONS preflight, return a 204 Response with CORS
 * headers. Otherwise return null and let the caller continue.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

/** Helper to build a JSON response with CORS headers already attached. */
export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}
