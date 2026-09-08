/**
 * Tidy Pro Portal — data access layer.
 *
 * Every read of a visit goes through the security-definer RPC
 * public.pro_get_visits, which returns ONLY the columns a Pro is allowed to
 * see: customer first name, street, ZIP, access/gate/pet/parking notes,
 * service type, time window and visit pay. No last name, email, phone,
 * billing, plan price or customer cost is ever selected here.
 *
 * Nothing in this file reads or writes location, clock-in or elapsed time.
 */
import { supabase } from "@/integrations/supabase/client";

export type ProVisit = {
  id: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  service_type: string | null;
  street: string | null;
  zip: string | null;
  customer_first_name: string | null;
  access_notes: string | null;
  gate_code: string | null;
  pet_notes: string | null;
  parking_notes: string | null;
  visit_pay_cents: number | null;
  status: string | null;
  on_my_way_at: string | null;
  completed_at: string | null;
  is_sample: boolean | null;
  before_photos: number | null;
  after_photos: number | null;
  /** standard · maintenance_wash · full_detail · quarterly_deep_clean */
  visit_kind?: string | null;
  paid_in_full_reason?: string | null;
};

export const VISIT_KIND_LABEL: Record<string, string> = {
  full_detail: "Full detail",
  maintenance_wash: "Maintenance wash",
  quarterly_deep_clean: "Quarterly deep clean",
};

export type ProMe = {
  pro_id: string;
  first_name: string | null;
  tier: string | null;
  completed_visits: number | null;
  avg_rating: number | null;
  active_since: string | null;
  badge_status: string | null;
  badge_token: string | null;
  referral_code: string | null;
  pro_number: string | null;
};

export type CoiState = {
  status: "none" | "under_review" | "active" | "expiring" | "expired";
  carrier: string | null;
  policy_number: string | null;
  expires_at: string | null;
  certificate_path: string | null;
  can_work: boolean;
};

export type PayoutWeek = {
  id: string;
  week_start: string;
  week_end: string;
  payout_date: string;
  status: string;
  visit_pay_cents: number;
  bonus_cents: number;
};

export type ProBonus = {
  id: string;
  bonus_type: string | null;
  amount_cents: number | null;
  earned_at: string | null;
  month_key: string | null;
  reason: string | null;
  status: string | null;
};

export type ProNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

export type ChecklistRow = {
  id: string;
  section: string;
  label: string;
  sort_order: number;
  checked: boolean;
};

export async function fetchMe(): Promise<ProMe | null> {
  const { data, error } = await supabase.rpc("pro_get_me");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as ProMe) ?? null;
}

export async function fetchVisits(): Promise<ProVisit[]> {
  const { data, error } = await supabase.rpc("pro_get_visits");
  if (error) throw error;
  return (data as ProVisit[]) ?? [];
}

export async function fetchCoi(proUserId: string): Promise<CoiState | null> {
  const { data, error } = await supabase.rpc("pro_coi_state", { _pro: proUserId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as CoiState) ?? null;
}

export async function fetchPayoutWeeks(): Promise<PayoutWeek[]> {
  const { data, error } = await supabase
    .from("payout_weeks")
    .select("id, week_start, week_end, payout_date, status, visit_pay_cents, bonus_cents")
    .order("week_start", { ascending: false });
  if (error) throw error;
  return (data as PayoutWeek[]) ?? [];
}

export async function fetchBonuses(proId: string): Promise<ProBonus[]> {
  const { data, error } = await supabase
    .from("pro_bonuses")
    .select("id, bonus_type, amount_cents, earned_at, month_key, reason, status")
    .eq("pro_id", proId)
    .order("earned_at", { ascending: false });
  if (error) throw error;
  return (data as ProBonus[]) ?? [];
}

export async function fetchNotifications(): Promise<ProNotification[]> {
  const { data, error } = await supabase
    .from("pro_notifications")
    .select("id, kind, title, body, url, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as ProNotification[]) ?? [];
}

export async function markNotificationsRead(ids: string[]) {
  if (!ids.length) return;
  await supabase.from("pro_notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
}

/** Checklist for one visit: template rows joined with this visit's ticks. */
export async function fetchChecklist(visitId: string, serviceType: string): Promise<ChecklistRow[]> {
  const [templates, items] = await Promise.all([
    supabase
      .from("checklist_templates")
      .select("id, section, label, sort_order")
      .eq("service_type", serviceType)
      .order("sort_order"),
    supabase.from("visit_checklist_items").select("template_id, checked_at").eq("visit_id", visitId),
  ]);
  if (templates.error) throw templates.error;
  const ticked = new Set(
    (items.data ?? []).filter((i) => i.checked_at).map((i) => i.template_id as string),
  );
  return (templates.data ?? []).map((t) => ({
    id: t.id as string,
    section: t.section as string,
    label: t.label as string,
    sort_order: t.sort_order as number,
    checked: ticked.has(t.id as string),
  }));
}

export async function toggleChecklistItem(
  visitId: string,
  templateId: string,
  proId: string,
  checked: boolean,
) {
  const { error } = await supabase.from("visit_checklist_items").upsert(
    {
      visit_id: visitId,
      template_id: templateId,
      pro_id: proId,
      checked_at: checked ? new Date().toISOString() : null,
    },
    { onConflict: "visit_id,template_id" },
  );
  if (error) throw error;
}

export type VisitPhoto = { id: string; kind: string; storage_path: string; uploaded_at: string };

export async function fetchVisitPhotos(visitId: string): Promise<VisitPhoto[]> {
  const { data, error } = await supabase
    .from("visit_photos")
    .select("id, kind, storage_path, uploaded_at")
    .eq("visit_id", visitId)
    .order("uploaded_at");
  if (error) throw error;
  return (data as VisitPhoto[]) ?? [];
}

export async function uploadVisitPhoto(
  visitId: string,
  proUserId: string,
  kind: "before" | "after",
  file: File,
) {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${proUserId}/${visitId}/${kind}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from("visit-photos").upload(path, file, { upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase
    .from("visit_photos")
    .insert({ visit_id: visitId, pro_id: proUserId, kind, storage_path: path });
  if (error) throw error;
}

export async function removeVisitPhoto(photo: VisitPhoto) {
  await supabase.storage.from("visit-photos").remove([photo.storage_path]);
  const { error } = await supabase.from("visit_photos").delete().eq("id", photo.id);
  if (error) throw error;
}

export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("visit-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Server-enforced visit actions. Returns the function's own {ok,error} shape. */
export async function visitAction(
  visitId: string,
  action: "on_my_way" | "complete" | "blocked",
  blocked?: { reason: "customer_no_access" | "unsafe_conditions"; note: string },
) {
  const { data, error } = await supabase.functions.invoke("pro-visit-action", {
    body: { visit_id: visitId, action, ...(action === "blocked" ? blocked : {}) },
  });
  if (error) return { ok: false as const, error: error.message };
  return data as { ok: boolean; error?: string; coi_status?: string; visit_pay_cents?: number };
}

/* ---------- small shared date helpers ---------- */

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function dayLabel(iso: string | null): string {
  if (!iso) return "Unscheduled";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function timeWindow(start: string | null, end: string | null): string {
  if (!start) return "Time to be confirmed";
  const f = (s: string) =>
    new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return end ? `${f(start)} – ${f(end)}` : f(start);
}

export function csvEscape(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
