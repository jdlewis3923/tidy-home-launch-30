// Plan-line snapshots.
//
// A plan line records, per service: size tier, cadence, whether a surcharge
// applies and the monthly amount. It carries NO contractor pay — the snapshot
// ends up in subscriptions.plan_lines, which the customer can read. Visit pay is
// derived server-side from canon by generate_recurring_visits, and the pro's
// tier uplift is applied at completion time.
//
// It is persisted to public.plan_line_sets (service-role only) and Stripe
// metadata carries only the row id. Stripe caps a metadata VALUE at 500
// characters, and the full JSON for a two-service cart is 556 bytes — which is
// why every bundle signup failed.

export interface PlanLine {
  service: string;
  size_tier: number;
  cadence: string;
  surcharge_applied: boolean;
  surcharge_cents: number;
  visits_per_month: number;
  per_visit_cents: number;
  monthly_cents: number;
  lookup_key: string;
  stripe_price_id: string;
}

/** Writes the snapshot and returns its row id, or null if the write failed. */
// deno-lint-ignore no-explicit-any
export async function savePlanLines(supabase: any, args: {
  userId: string;
  lines: PlanLine[];
  source: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("plan_line_sets")
    .insert({ user_id: args.userId, lines: args.lines, source: args.source })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[plan-lines] insert failed", error.message);
    return null;
  }
  return (data?.id as string) ?? null;
}

/**
 * Reads the snapshot back for the webhook. Prefers the row id; falls back to
 * the legacy inline JSON so subscriptions created before this change still seed.
 */
// deno-lint-ignore no-explicit-any
export async function loadPlanLines(supabase: any, meta: Record<string, string>): Promise<PlanLine[]> {
  if (meta.plan_lines_id) {
    const { data, error } = await supabase
      .from("plan_line_sets")
      .select("lines")
      .eq("id", meta.plan_lines_id)
      .maybeSingle();
    if (error) console.error("[plan-lines] read failed", error.message);
    const lines = data?.lines;
    if (Array.isArray(lines) && lines.length > 0) return lines as PlanLine[];
  }
  if (meta.plan_lines_json) {
    try {
      return JSON.parse(meta.plan_lines_json) as PlanLine[];
    } catch {
      console.error("[plan-lines] legacy plan_lines_json was not parseable");
    }
  }
  return [];
}
