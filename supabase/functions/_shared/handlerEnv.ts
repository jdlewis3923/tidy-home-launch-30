// Tidy — handler-scope environment reading + named missing-env reporting.
//
// Rule (prompt 4, part 1): NEVER read secrets at module scope. A module-scope
// read that throws kills the isolate before any logging or graceful response
// can run, which is exactly why self-tests saw an opaque non-2xx with no row
// in integration_logs.
//
// Usage inside a handler:
//   const env = readEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const);
//   if (env.missing.length) return missingEnvResponse(env.missing);

export interface EnvResult<K extends string> {
  values: Record<K, string>;
  missing: string[];
}

/** Reads each name from Deno.env at call time. Never throws. */
export function readEnv<K extends string>(names: readonly K[]): EnvResult<K> {
  const values = {} as Record<K, string>;
  const missing: string[] = [];
  for (const name of names) {
    let v: string | undefined;
    try {
      v = Deno.env.get(name);
    } catch {
      v = undefined;
    }
    if (v === undefined || v === null || v.trim() === '') {
      missing.push(name);
      values[name] = '';
    } else {
      values[name] = v;
    }
  }
  return { values, missing };
}

/** Optional read — absence is not an error. */
export function readOptionalEnv(name: string): string | undefined {
  try {
    const v = Deno.env.get(name);
    return v && v.trim() !== '' ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Canonical named error string, e.g. "MISSING_ENV: TWILIO_FROM_NUMBER". */
export function missingEnvError(missing: string[]): string {
  return `MISSING_ENV: ${missing.join(', ')}`;
}
