import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { appointmentLabel, bookedAppointments } from '@/lib/candidate-appointments';
import { applicationChannels } from "@/lib/admin-report-rules";

export type Channels = ReturnType<typeof applicationChannels> & { callLabel: string; callBooked: boolean; appointmentLabels: string[] };

/** Batch-loads "applied on Indeed?" and "what happened with our texted link?" for a list of applicant ids. */
export function useApplicationChannels(ids: (string | null | undefined)[]) {
  const key = Array.from(new Set(ids.filter(Boolean) as string[])).sort().join(",");
  const [map, setMap] = useState<Map<string, Channels>>(new Map());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(r => r + 1);
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
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
        const counts = new Map<string, number>();
        for (const a of ans ?? []) counts.set(a.candidate_id, (counts.get(a.candidate_id) ?? 0) + 1);
        const pipe = new Map((pipes ?? []).map((p) => [p.applicant_id, p]));
        for (const a of apps ?? []) {
          const p = pipe.get(a.id);
          const base = applicationChannels({ source: p?.source, applicantSource: a.source, hasLink: !!p?.apply_resume_token, invited_at: p?.invited_at, apply_submitted_at: p?.apply_submitted_at, answers: counts.get(a.id) ?? 0 });
          const appointments = bookedAppointments((slots ?? []).filter(s => s.applicant_id === a.id));
          const labels = appointments.map(s => appointmentLabel(s));
          out.set(a.id, { ...base, callBooked: !!appointments.length, appointmentLabels: labels, callLabel: labels[0] ?? 'Call: NOT booked' });
        }
      }
      if (alive) setMap(out);
    })();
    return () => { alive = false; };
  }, [key, revision]);
  return map;
}
