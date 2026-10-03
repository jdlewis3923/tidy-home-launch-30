/** Hiring triggers from reservations (10 → first pro, 30 → pro #2) as Workday tasks. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Task = { id: string; title: string; detail: string | null; occurred_at: string; action_url: string | null };

export default function ReservationTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const load = async () => {
    const { data } = await supabase.from("admin_workday_events").select("id, title, detail, occurred_at, action_url")
      .eq("event_type", "reservation_threshold").eq("status", "open").order("occurred_at", { ascending: true });
    setTasks((data ?? []) as Task[]);
  };
  useEffect(() => { load(); }, []);
  if (!tasks.length) return null;
  const done = async (id: string) => {
    await supabase.from("admin_workday_events").update({ status: "done", waiting_on_admin: false }).eq("id", id);
    load();
  };
  return (
    <div className="border-b border-border bg-accent/30 px-5 py-3" data-testid="reservation-tasks">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Waiting on me · hiring from reservations</p>
      <ul className="mt-2 space-y-2">{tasks.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-foreground">{t.title}</span>
          <span className="text-muted-foreground">{t.detail}</span>
          <Link to={t.action_url ?? "/admin/applicants"} className="ml-auto text-xs font-semibold text-primary underline">Open Call Queue</Link>
          <Button size="sm" variant="outline" onClick={() => done(t.id)}>Done</Button>
        </li>
      ))}</ul>
    </div>
  );
}
