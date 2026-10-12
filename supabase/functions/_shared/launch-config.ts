// Loads launch dates from launch_config for edge functions (see _shared/launch.ts for formatting).
import type { LaunchConfig, LaunchRow } from './launch.ts';

// deno-lint-ignore no-explicit-any
export async function loadLaunchConfig(admin: any): Promise<LaunchConfig> {
  const { data, error } = await admin.from('launch_config').select('*');
  if (error) throw new Error(`launch_config: ${error.message}`);
  const cfg: LaunchConfig = {};
  for (const r of (data ?? []) as LaunchRow[]) cfg[r.scope] = r;
  return cfg;
}

/** Miami-time today as YYYY-MM-DD. */
export function easternTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
