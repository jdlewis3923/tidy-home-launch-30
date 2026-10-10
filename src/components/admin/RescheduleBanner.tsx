/** Red strip at the top of the admin dashboard while any visit needs a manual reschedule. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function RescheduleBanner() {
  const [n, setN] = useState(0);
  useEffect(() => {
    void supabase.from("reschedule_items").select("id", { count: "exact", head: true }).eq("status", "open")
      .then(({ count }) => setN(count ?? 0));
  }, []);
  if (!n) return null;
  return (
    <Link to="/admin/reschedules" className="mb-4 block rounded-lg border border-destructive bg-destructive px-4 py-3 text-sm font-bold text-destructive-foreground">
      {n} {n === 1 ? "visit needs" : "visits need"} rescheduling — open Reschedules →
    </Link>
  );
}

/** Hire specs from the pivot ladder, shown on the candidate pipeline so screening targets exact days. */
export function HireSpecsBanner() {
  const [specs, setSpecs] = useState<{ id: string; spec: string }[]>([]);
  useEffect(() => {
    void supabase.from("hire_specs").select("id, spec").eq("status", "open").order("created_at", { ascending: false })
      .then(({ data }) => setSpecs(data ?? []));
  }, []);
  if (!specs.length) return null;
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-bold text-destructive">Screen for these days</p>
      <ul className="mt-1 list-disc pl-5">{specs.map((s) => <li key={s.id}>{s.spec}</li>)}</ul>
    </div>
  );
}
