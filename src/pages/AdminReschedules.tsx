/** /admin/reschedules — visits the system could not place, days losing their Pro, and inactive-Pro visits. */
import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SERVICE_NAME, schedError } from "@/lib/scheduling";

type Item = {
  id: string; kind: string; reason: string; status: string; created_at: string; details: Record<string, unknown>;
  resolution_note: string | null; visit_id: string | null; visit_date: string | null; service: string | null; zip: string | null;
  customer: string | null; window: string | null; pro: string | null;
};
const KIND: Record<string, string> = {
  unplaceable: "Couldn't move automatically", day_loss: "Needs a new day", inactive_pro: "Pro no longer active", hours_shortened: "Hours shortened",
};

function Row({ item, onDone }: { item: Item; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const open = item.status === "open";
  const move = async () => {
    const { data, error } = await supabase.rpc("admin_move_visit", { _visit: item.visit_id!, _date: date, _window: null as unknown as string, _reason: reason });
    if (error) { toast.error(schedError(error)); return; }
    toast.success((data as { over_capacity: boolean }).over_capacity ? "Moved over capacity — override logged." : "Moved. The customer has been told.");
    onDone();
  };
  const resolve = async () => {
    const { error } = await supabase.rpc("admin_resolve_reschedule", { _id: item.id, _note: note || "Handled" });
    if (error) { toast.error(schedError(error)); return; }
    onDone();
  };
  return (
    <li className={`rounded-lg border p-4 ${open ? "border-destructive/50 bg-destructive/5" : "border-border bg-card opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={`text-sm font-bold ${open ? "text-destructive" : "text-foreground"}`}>{KIND[item.kind] ?? item.kind}</p>
          <p className="text-sm">{SERVICE_NAME[item.service ?? ""] ?? item.service} · {item.zip} · {item.customer ?? "Customer"}{item.visit_date ? ` · ${item.visit_date}` : ""}{item.window ? ` · ${item.window}` : ""}{item.pro ? ` · Pro ${item.pro}` : ""}</p>
          <p className="text-xs text-muted-foreground">{item.reason}{item.details?.effective ? ` · effective ${String(item.details.effective)}` : ""}</p>
          {item.resolution_note && <p className="text-xs text-muted-foreground">Resolved: {item.resolution_note}</p>}
        </div>
        <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.visit_id && (
            <>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
              <Input placeholder="Reason (logged)" value={reason} onChange={(e) => setReason(e.target.value)} className="w-56" />
              <Button size="sm" disabled={!date || reason.trim().length < 3} onClick={() => void move()}>Move visit</Button>
            </>
          )}
          <Input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} className="w-48" />
          <Button size="sm" variant="outline" onClick={() => void resolve()}>Mark handled</Button>
        </div>
      )}
    </li>
  );
}

export default function AdminReschedules() {
  const [items, setItems] = useState<Item[] | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_reschedule_list");
    if (error) { toast.error(schedError(error)); return; }
    setItems((data ?? []) as unknown as Item[]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const openCount = (items ?? []).filter((i) => i.status === "open").length;
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Reschedules | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Reschedules</h1>
            <p className="mt-1 text-sm text-muted-foreground">{openCount} open. Moving past capacity needs a reason and is logged.</p>
          </div>
          <Link to="/admin/calendar" className="text-sm font-semibold text-primary">Service calendar →</Link>
        </div>
        {items === null && <p className="text-muted-foreground">Loading…</p>}
        {items?.length === 0 && <p className="text-muted-foreground">Nothing needs you.</p>}
        <ul className="space-y-3">{(items ?? []).map((i) => <Row key={i.id} item={i} onDone={() => void load()} />)}</ul>
      </div>
    </main>
  );
}
