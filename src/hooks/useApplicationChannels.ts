import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applicationChannels } from "@/lib/admin-report-rules";

export type Channels = ReturnType<typeof applicationChannels> & { callLabel: string; callBooked: boolean };

/** Batch-loads "applied on Indeed?" and "what happened with our texted link?" for a list of applicant ids. */
export function useApplicationChannels(ids: (string | null | undefined)[]) {
  const key = Array.from(new Set(ids.filter(Boolean) as string[])).sort().join(",");
  const [map, setMap] = useState<Map<string, Channels>>(new Map());
  useEffect(() => {
    if (!key) { setMap(new Map()); return; }
    const list = key.split(",");
    let alive = true;
    void (async () => {
      const out = new Map<string, Channels>();
      for (let i = 0; i < list.length; i += 150) {
        const chunk = list.slice(i, i + 150);
        const [{ data: apps }, { data: pipes }, { data: ans }, { data: slots }] = await Promise.all([
          supabase.from("applicants").select("id, source").in("id", chunk),
          supabase.from("contractor_pipeline").select("applicant_id, source, invited_at, apply_resume_token, apply_submitted_at").in("applicant_id", chunk),
          supabase.from("application_answers").select("candidate_id").in("candidate_id", chunk),
          supabase.from("hiring_slots").select("applicant_id, kind, starts_at, status").in("applicant_id", chunk).eq("status", "booked").order("starts_at"),
        ]);
        const slot = new Map<string, { kind: string; starts_at: string }>();
        for (const s of slots ?? []) if (s.applicant_id && !slot.has(s.applicant_id)) slot.set(s.applicant_id, s);
        const counts = new Map<string, number>();
        for (const a of ans ?? []) counts.set(a.candidate_id, (counts.get(a.candidate_id) ?? 0) + 1);
        const pipe = new Map((pipes ?? []).map((p) => [p.applicant_id, p]));
        for (const a of apps ?? []) {
          const p = pipe.get(a.id);
          const base = applicationChannels({ source: p?.source, applicantSource: a.source, hasLink: !!p?.apply_resume_token, invited_at: p?.invited_at, apply_submitted_at: p?.apply_submitted_at, answers: counts.get(a.id) ?? 0 });
          const sl = slot.get(a.id);
          const when = sl && new Date(sl.starts_at).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
          out.set(a.id, { ...base, callBooked: !!sl, callLabel: sl ? `${sl.kind === "phone" ? "Phone call" : "Interview"} BOOKED: ${when} ET` : "Call: NOT booked" });
        }
      }
      if (alive) setMap(out);
    })();
    return () => { alive = false; };
  }, [key]);
  return map;
}
