export type ActionableAlert = {
  id: string;
  created_at: string;
  alert_type?: string | null;
  title?: string | null;
  dedupe_key?: string | null;
  resolved_at?: string | null;
  snoozed_until?: string | null;
};

/** One current task per repeating source, rather than one task per notification. */
export function currentActionableAlerts<T extends ActionableAlert>(rows: T[], now = Date.now()): T[] {
  const eligible = rows
    .filter((row) => !row.resolved_at && (!row.snoozed_until || Date.parse(row.snoozed_until) <= now))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const seen = new Set<string>();
  return eligible.filter((row) => {
    let key: string;
    if (row.alert_type === 'ops_digest') key = 'ops_digest:latest';
    else if (row.alert_type === 'roadmap_urgent') key = `roadmap:${row.dedupe_key?.split(':')[1] ?? row.title ?? row.id}`;
    else key = row.dedupe_key ?? `${row.alert_type ?? 'alert'}:${row.title ?? row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
