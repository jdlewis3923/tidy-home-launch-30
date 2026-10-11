// Service scope: which scope rows a purchase must accept, server-side checks,
// and the email block. All scope TEXT lives in public.service_scope.
// deno-lint-ignore-file no-explicit-any

export const SCOPE_SERVICES = ['cleaning', 'cleaning_deep_clean', 'lawn', 'car_wash', 'car_detail'] as const;
export type ScopeService = (typeof SCOPE_SERVICES)[number];
/** What the customer ticks: one checkbox per bought service. */
export const SCOPE_GROUPS = ['cleaning', 'lawn', 'car_care', 'car_wash_addon'] as const;
export type ScopeGroup = (typeof SCOPE_GROUPS)[number];

export const GROUP_SCOPES: Record<ScopeGroup, ScopeService[]> = {
  cleaning: ['cleaning', 'cleaning_deep_clean'],
  lawn: ['lawn'],
  car_care: ['car_wash', 'car_detail'],
  car_wash_addon: ['car_wash'],
};
export const isCarGroup = (g: ScopeGroup) => g === 'car_care' || g === 'car_wash_addon';

/** Map plan service keys (cleaning | lawn | detailing) + car wash add-on → groups. */
export function groupsFor(services: string[], carWashAddon = false): ScopeGroup[] {
  const out = new Set<ScopeGroup>();
  for (const s of services) {
    if (s === 'cleaning') out.add('cleaning');
    else if (s === 'lawn') out.add('lawn');
    else if (s === 'detailing' || s === 'car_care') out.add('car_care');
  }
  if (carWashAddon && !out.has('car_care')) out.add('car_wash_addon');
  return [...out];
}

/**
 * Server gate: every required scope must have an acceptance under `ref` at the
 * CURRENT version, belonging to this email or user, made in the last 24 hours.
 * Car scopes also need the water consent.
 */
export async function verifyScopeAcceptance(
  admin: any,
  opts: { ref?: string | null; email?: string | null; userId?: string | null; groups: ScopeGroup[] },
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  const needed = new Map<ScopeService, boolean>();
  for (const g of opts.groups) for (const s of GROUP_SCOPES[g]) needed.set(s, needed.get(s) || isCarGroup(g));
  if (!needed.size) return { ok: true };
  if (!opts.ref) return { ok: false, missing: [...needed.keys()] };
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: rows } = await admin.from('scope_acceptances')
    .select('service, scope_version, email, customer_id, water_consent')
    .eq('acceptance_ref', opts.ref).gte('accepted_at', since);
  const { data: versions } = await admin.from('scope_versions').select('service, scope_version');
  const current = new Map<string, number>();
  for (const v of versions ?? []) current.set(v.service, Math.max(current.get(v.service) ?? 0, v.scope_version));
  const email = (opts.email ?? '').toLowerCase();
  const missing: string[] = [];
  for (const [svc, needsWater] of needed) {
    const hit = (rows ?? []).find((r: any) =>
      r.service === svc && r.scope_version === (current.get(svc) ?? 1) &&
      ((email && (r.email ?? '').toLowerCase() === email) || (opts.userId && r.customer_id === opts.userId)) &&
      (!needsWater || r.water_consent === true));
    if (!hit) missing.push(svc);
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}

type Row = { service: string; section: string; text_en: string; text_es: string; group_en: string | null; group_es: string | null; notice_key: string | null; sort_order: number };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const TITLES: Record<string, [string, string]> = {
  cleaning: ['House Cleaning', 'Limpieza del hogar'],
  cleaning_deep_clean: ['Quarterly deep clean', 'Limpieza profunda trimestral'],
  lawn: ['Lawn Care', 'Cuidado del césped'],
  car_wash: ['Car Care — maintenance wash', 'Cuidado del Auto — lavado de mantenimiento'],
  car_detail: ['Car Care — full detail', 'Cuidado del Auto — detallado completo'],
};
const SECTIONS: Record<string, [string, string]> = {
  included: ['Included', 'Incluido'], not_included: ['Not included', 'No incluido'],
  add_on: ['Add-ons', 'Servicios adicionales'], customer_must: ['You need to', 'Usted debe'],
};

/** "Your plan includes" email block, read from service_scope in the reader's language. */
export async function scopeEmailHtml(admin: any, groups: ScopeGroup[], lang: 'en' | 'es', opts: { monthlyLawn?: boolean } = {}): Promise<string> {
  const scopes = [...new Set(groups.flatMap((g) => GROUP_SCOPES[g]))];
  if (!scopes.length) return '';
  const { data } = await admin.from('service_scope').select('service, section, text_en, text_es, group_en, group_es, notice_key, sort_order')
    .in('service', scopes).eq('active', true).order('sort_order');
  const rows = (data ?? []) as Row[];
  const L = lang === 'es' ? 1 : 0;
  const t = (r: Row) => esc(L ? r.text_es : r.text_en);
  let html = `<h2 style="font-size:18px;margin:24px 0 8px">${L ? 'Su plan incluye' : 'Your plan includes'}</h2>`;
  for (const svc of scopes) {
    const mine = rows.filter((r) => r.service === svc);
    if (!mine.length) continue;
    html += `<h3 style="font-size:15px;margin:18px 0 6px">${esc(TITLES[svc][L])}</h3>`;
    for (const n of mine.filter((r) => r.section === 'notice')) {
      if (n.notice_key === 'monthly_growth' && !opts.monthlyLawn) continue;
      html += `<p style="margin:6px 0;padding:8px 10px;background:#f1f5f9;border-radius:8px;font-size:13px">${t(n)}</p>`;
    }
    for (const sec of ['included', 'not_included', 'add_on', 'customer_must']) {
      const items = mine.filter((r) => r.section === sec);
      if (!items.length) continue;
      html += `<p style="margin:10px 0 4px;font-weight:700;font-size:13px">${SECTIONS[sec][L]}</p><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.5">`;
      let group: string | null = null;
      for (const r of items) {
        const g = L ? r.group_es : r.group_en;
        if (g && g !== group) { html += `<li style="list-style:none;margin-left:-18px;font-weight:600">${esc(g)}</li>`; group = g; }
        html += `<li>${t(r)}</li>`;
      }
      html += '</ul>';
    }
  }
  return html;
}

/** Scopes that apply to one visit. */
export function visitScopes(serviceType: string | null, visitKind: string | null): ScopeService[] {
  if (serviceType === 'cleaning') return visitKind === 'deep_clean' ? ['cleaning', 'cleaning_deep_clean'] : ['cleaning'];
  if (serviceType === 'lawn') return ['lawn'];
  if (serviceType === 'detailing' || visitKind === 'car_wash') return visitKind === 'full_detail' ? ['car_wash', 'car_detail'] : ['car_wash'];
  return [];
}

/** Scope rows at the version this member is held to (accepted version until 30 days after notice). */
export async function memberScopeRows(admin: any, userId: string | null, scopes: ScopeService[]) {
  const out: Row[] = [];
  for (const svc of scopes) {
    let v: number | null = null;
    if (userId) { const { data } = await admin.rpc('member_scope_version', { _user: userId, _service: svc }); v = typeof data === 'number' ? data : null; }
    let q = admin.from('service_scope').select('service, section, text_en, text_es, group_en, group_es, notice_key, sort_order').eq('service', svc).order('sort_order');
    q = v ? q.eq('scope_version', v) : q.eq('active', true);
    const { data } = await q;
    out.push(...((data ?? []) as Row[]));
  }
  return out;
}
