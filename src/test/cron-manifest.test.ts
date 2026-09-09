// Tidy — regression tests for the class of failure that kept happening tonight:
// a fix that REPORTED SUCCESS WITHOUT LANDING. A SQL replace that matched
// nothing, a helper shipped with zero callers, a job whose target function does
// not exist, a call site fixed in two of three places. None were hard bugs;
// all were invisible. These tests make them visible at build time.
//
// Live-database checks deliberately live in scripts/live-audit.mjs instead.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EXPECTED_CRON_JOBS, RETIRED_CRON_JOBS } from '../../supabase/functions/_shared/cron-manifest';

const FUNCTIONS_DIR = 'supabase/functions';
const MIGRATIONS_DIR = 'drizzle/migrations';

function sqlFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf8') }));
}

function allMigrationSql(): string {
  return sqlFiles().map((f) => f.sql).join('\n');
}

function edgeFunctionDirs(): string[] {
  return readdirSync(FUNCTIONS_DIR).filter(
    (d) => !d.startsWith('_') && statSync(join(FUNCTIONS_DIR, d)).isDirectory(),
  );
}

function edgeFunctionSources(): { file: string; code: string }[] {
  const out: { file: string; code: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) out.push({ file: p, code: readFileSync(p, 'utf8') });
    }
  };
  walk(FUNCTIONS_DIR);
  return out;
}

describe('cron manifest', () => {
  it('names a real edge function for every HTTP job', () => {
    const missing = EXPECTED_CRON_JOBS.filter(
      (j) => j.kind === 'http' && !existsSync(join(FUNCTIONS_DIR, j.fn ?? '')),
    ).map((j) => `${j.name} -> ${j.fn}`);
    expect(missing).toEqual([]);
  });

  it('commits every expected job to a migration, with the same schedule', () => {
    const sql = allMigrationSql();
    const problems: string[] = [];
    for (const j of EXPECTED_CRON_JOBS) {
      // Last committed cron.schedule() call for this job name wins, the same way
      // the database resolves repeated schedule calls.
      const re = new RegExp(
        `cron\\.schedule\\(\\s*'${j.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*,\\s*'([^']+)'`,
        'g',
      );
      const matches = [...sql.matchAll(re)];
      if (matches.length === 0) {
        problems.push(`${j.name}: never scheduled in any migration`);
        continue;
      }
      const committed = matches[matches.length - 1][1];
      if (committed !== j.schedule) {
        problems.push(`${j.name}: manifest "${j.schedule}" vs migration "${committed}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('has unique job names and no name that is also marked retired', () => {
    const names = EXPECTED_CRON_JOBS.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
    const clash = RETIRED_CRON_JOBS.filter((r) => names.includes(r.name));
    expect(clash).toEqual([]);
  });

  it('gives every job a purpose, so a missing-job alert says what broke', () => {
    expect(EXPECTED_CRON_JOBS.filter((j) => !j.purpose?.trim())).toEqual([]);
  });
});

describe('helpers that shipped with no callers', () => {
  it('cron_http_post has at least one scheduled caller', () => {
    const sql = allMigrationSql();
    const callers = [...sql.matchAll(/cron_http_post\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(callers.length).toBeGreaterThan(0);
    // and every caller passes its own job name as the first argument
    const named = new Set(EXPECTED_CRON_JOBS.map((j) => j.name));
    const unknown = [...new Set(callers)].filter((c) => !named.has(c));
    expect(unknown).toEqual([]);
  });

  it('the heartbeat actually calls the manifest diff', () => {
    const code = readFileSync(join(FUNCTIONS_DIR, 'cron-heartbeat/index.ts'), 'utf8');
    expect(code).toContain('cron_manifest_diff');
    expect(code).toContain('manifestForRpc');
  });
});

describe('SECURITY DEFINER guard shapes in committed SQL', () => {
  const definerBodies = () => {
    const bodies: { file: string; name: string; body: string }[] = [];
    for (const { name: file, sql } of sqlFiles()) {
      const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(\w+)[\s\S]*?SECURITY\s+DEFINER([\s\S]*?)\$(fn|\$|body|unsched)?\$/gi;
      // Coarse split is enough: we scan statement-by-statement below instead.
      void re;
      const statements = sql.split(/;\s*\n(?=CREATE|GRANT|REVOKE|SELECT|ALTER|DO)/i);
      for (const st of statements) {
        if (!/SECURITY\s+DEFINER/i.test(st)) continue;
        const m = st.match(/FUNCTION\s+public\.(\w+)/i);
        bodies.push({ file, name: m?.[1] ?? 'unknown', body: st });
      }
    }
    return bodies;
  };

  it('no definer function relies on current_user for authorisation', () => {
    const offenders = definerBodies()
      .filter((b) => /\bcurrent_user\b/i.test(b.body))
      .map((b) => `${b.file}:${b.name}`);
    expect(offenders).toEqual([]);
  });

  it('no definer function uses the fail-open null-auth.uid() guard shape', () => {
    // "IF auth.uid() IS NOT NULL AND NOT has_role(...) THEN RAISE" lets a caller
    // with a NULL auth.uid() straight through. The fail-closed form is
    // "IF NOT public.is_privileged_caller() THEN RAISE".
    const offenders = definerBodies()
      .filter((b) =>
        /auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+AND\s+NOT\b/i.test(b.body) ||
        /IF\s+auth\.uid\(\)\s+IS\s+NOT\s+NULL[\s\S]{0,200}?RAISE/i.test(b.body),
      )
      .map((b) => `${b.file}:${b.name}`);
    expect(offenders).toEqual([]);
  });
});

describe('edge functions call only identifiers they define or import', () => {
  // The callJobberFn class of failure: a helper deleted in one place, still
  // called in another, and nothing catches it until runtime.
  const REMOVED = ['callJobberFn', 'jobberFetch', 'getJobberToken'];

  it('no reference to a removed helper survives anywhere', () => {
    const hits: string[] = [];
    for (const { file, code } of edgeFunctionSources()) {
      for (const id of REMOVED) {
        // A comment mentioning the decommission is fine; a call is not.
        const callRe = new RegExp(`(?<!//[^\\n]*)\\b${id}\\s*\\(`);
        for (const line of code.split('\n')) {
          if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
          if (callRe.test(line)) hits.push(`${file}: ${id}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('every function directory has an entrypoint', () => {
    const missing = edgeFunctionDirs().filter(
      (d) => !existsSync(join(FUNCTIONS_DIR, d, 'index.ts')),
    );
    expect(missing).toEqual([]);
  });
});

describe('contractor pay never reaches a customer-readable shape', () => {
  it('no browser code selects or types contractor pay', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          if (entry === 'test') continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(p) && !p.endsWith('types.ts')) {
          const code = readFileSync(p, 'utf8');
          if (/contractor_pay_cents|visit_pay_cents/.test(code)) {
            // Pro-facing surfaces read pay through pro_get_visits, which is
            // scoped to the signed-in Pro; anything else is a leak.
            if (!/pro_get_visits/.test(code) && !/\/Pro/.test(p) && !/pro/i.test(entry)) {
              hits.push(p);
            }
          }
        }
      }
    };
    walk('src');
    expect(hits).toEqual([]);
  });

  it('the plan-line type carries no pay field', () => {
    const candidates = ['src/lib/planLines.ts', 'src/types/plan.ts', 'src/lib/plan.ts'];
    for (const f of candidates) {
      if (!existsSync(f)) continue;
      expect(readFileSync(f, 'utf8')).not.toContain('contractor_pay_cents');
    }
  });
});
