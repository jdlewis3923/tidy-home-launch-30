import '../_shared/http.ts';
// Tidy — service gate evaluation shared by hiring-mark-hired and hiring-gates.
//
// Gate green for a service means at least one contractor for that service is
// Active: Checkr clear, COI verified and unexpired, contract signed. Car care
// additionally needs a bound business policy that has not expired.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { writeAlert, resolveAlert } from './alerts.ts';

export type GateService = 'cleaning' | 'lawn' | 'car_care';

export interface GateCondition {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface GateResult {
  service: GateService;
  green: boolean;
  conditions: GateCondition[];
  active_pros: number;
  is_live: boolean;
  auto_mode: boolean;
  scheduled_for: string | null;
}

/** Contractors that count as Active for a service. */
export async function activeProCount(
  admin: SupabaseClient,
  service: GateService,
): Promise<number> {
  const { data } = await admin
    .from('applicants')
    .select('id, service, bg_check_status, coi_general_liability_status, contracts_signed, current_stage')
    .not('contractor_id', 'is', null);

  const rows = data ?? [];
  return rows.filter((r: Record<string, unknown>) => {
    const svc = String(r.service ?? '');
    if (svc !== service && !svc.split(/[,\s]+/).includes(service)) return false;
    const checkrClear =
      String(r.bg_check_status ?? '') === 'clear';
    const coiOk = String(r.coi_general_liability_status ?? '') === 'verified';
    return checkrClear && coiOk && r.contracts_signed === true;
  }).length;
}

/** Next 7:00 AM America/New_York as an ISO instant. */
export function nextSevenAmEastern(now: Date = new Date()): string {
  // Eastern is UTC-4 (EDT) or UTC-5 (EST); derive the offset from the zone itself.
  const offsetHours = (() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-4';
    return Number(name.replace('GMT', '')) || -4;
  })();

  const easternNow = new Date(now.getTime() + offsetHours * 3600_000);
  const target = new Date(easternNow);
  target.setUTCHours(7, 0, 0, 0);
  if (target <= easternNow) target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - offsetHours * 3600_000).toISOString();
}

export async function evaluateGate(
  admin: SupabaseClient,
  service: GateService,
): Promise<GateResult> {
  const { data: gate } = await admin
    .from('service_gates')
    .select('*')
    .eq('service', service)
    .maybeSingle();

  const pros = await activeProCount(admin, service);
  const conditions: GateCondition[] = [
    {
      key: 'active_pro',
      label: 'At least one Active contractor (Checkr clear, COI verified, contract signed)',
      ok: pros >= 1,
      detail: `${pros} active`,
    },
  ];

  if (gate?.business_policy_required) {
    const expires = gate.business_policy_expires ? new Date(gate.business_policy_expires) : null;
    conditions.push({
      key: 'business_policy_bound',
      label: 'Business policy bound',
      ok: gate.business_policy_bound === true,
    });
    conditions.push({
      key: 'business_policy_unexpired',
      label: 'Business policy not expired',
      ok: !!expires && expires.getTime() > Date.now(),
      detail: gate.business_policy_expires ?? 'no expiry on file',
    });
  }

  return {
    service,
    green: conditions.every((c) => c.ok),
    conditions,
    active_pros: pros,
    is_live: gate?.is_live === true,
    auto_mode: gate?.auto_mode !== false,
    scheduled_for: gate?.go_live_scheduled_for ?? null,
  };
}

const LABEL: Record<GateService, string> = {
  cleaning: 'House cleaning',
  lawn: 'Lawn care',
  car_care: 'Car care',
};

/**
 * Apply the gate outcome: schedule go-live when green, pull the service down
 * immediately when red. Existing subscriptions are never touched.
 */
export async function applyGate(
  admin: SupabaseClient,
  result: GateResult,
): Promise<{ action: string }> {
  const svc = result.service;
  const name = LABEL[svc];

  if (result.green && !result.is_live) {
    if (!result.auto_mode) return { action: 'green_manual_mode' };
    if (result.scheduled_for && new Date(result.scheduled_for) > new Date()) {
      return { action: 'already_scheduled' };
    }
    const at = nextSevenAmEastern();
    await admin
      .from('service_gates')
      .update({
        go_live_scheduled_for: at,
        last_changed_at: new Date().toISOString(),
        last_change_reason: 'gate green — go-live scheduled',
      })
      .eq('service', svc);
    await writeAlert(admin, {
      level: 'critical',
      category: 'site',
      title: `${name} goes live at 7:00 AM tomorrow`,
      body: `Every gate for ${name.toLowerCase()} is green. Signup switches on at 7:00 AM Eastern.`,
      dedupe_key: `gate_go_live_${svc}_${at.slice(0, 10)}`,
      context: { service: svc, scheduled_for: at },
    });
    await resolveAlert(admin, `gate_red_${svc}`);
    return { action: 'scheduled_go_live' };
  }

  if (result.green && result.is_live) {
    await resolveAlert(admin, `gate_red_${svc}`);
    return { action: 'stays_live' };
  }

  // Red.
  if (result.is_live) {
    await admin
      .from('service_gates')
      .update({
        is_live: false,
        go_live_scheduled_for: null,
        last_changed_at: new Date().toISOString(),
        last_change_reason: 'gate red — signup pulled',
      })
      .eq('service', svc);
  } else if (result.scheduled_for) {
    await admin.from('service_gates').update({ go_live_scheduled_for: null }).eq('service', svc);
  }

  // A service that has simply not launched yet is not news. Only alert when a
  // live service was pulled down, or a scheduled go-live had to be cancelled.
  const wasExpectedLive = result.is_live || !!result.scheduled_for;
  if (wasExpectedLive) {
    const failed = result.conditions.filter((c) => !c.ok).map((c) => c.label).join('; ');
    await writeAlert(admin, {
      level: 'critical',
      category: 'site',
      title: `${name} is not live — a gate failed`,
      body: `Failing: ${failed}. Existing subscriptions are untouched; new signup shows "Opening soon — join the list".`,
      action_label: 'Open Site settings',
      action_url: '/admin/site-status',
      dedupe_key: `gate_red_${svc}`,
      context: { service: svc, conditions: result.conditions },
    });
  }
  return { action: result.is_live ? 'pulled_live' : 'stays_not_live' };
}


/** Flip any service whose scheduled go-live time has arrived. */
export async function promoteDueGoLives(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from('service_gates')
    .select('service, go_live_scheduled_for, is_live')
    .not('go_live_scheduled_for', 'is', null);

  const flipped: string[] = [];
  for (const row of data ?? []) {
    if (row.is_live) continue;
    if (new Date(row.go_live_scheduled_for as string) > new Date()) continue;
    const svc = row.service as GateService;
    const gate = await evaluateGate(admin, svc);
    if (!gate.green) continue; // never go live on a gate that turned red overnight
    await admin
      .from('service_gates')
      .update({
        is_live: true,
        go_live_scheduled_for: null,
        last_changed_at: new Date().toISOString(),
        last_change_reason: 'scheduled go-live reached',
      })
      .eq('service', svc);
    await writeAlert(admin, {
      level: 'action',
      category: 'site',
      title: `Announce ${LABEL[svc].toLowerCase()} to the waitlist`,
      body: `${LABEL[svc]} is live. Sending the waitlist announcement is a tap — nothing goes out on its own.`,
      action_label: 'Send announcement',
      action_url: `/admin/alerts?announce=${svc}`,
      dedupe_key: `waitlist_announce_${svc}`,
      context: { service: svc },
    });
    flipped.push(svc);
  }
  return flipped;
}
