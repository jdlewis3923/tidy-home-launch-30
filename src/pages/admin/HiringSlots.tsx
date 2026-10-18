/**
 * Slots — /admin/hiring/slots (hiring v5)
 * Open/booked phone and in-person slots; add custom slots; release bookings.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Phone, MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Slot = { id: string; kind: string; starts_at: string; duration_min: number; staff: string | null; status: string; applicant_id: string | null };

export default function HiringSlots() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"phone" | "in_person">("phone");
  const [when, setWhen] = useState("");
  const [staff, setStaff] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("hiring_slots").select("*").gte("starts_at", new Date().toISOString()).order("starts_at").limit(200);
    setSlots((data as Slot[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!when) return;
    const { error } = await supabase.from("hiring_slots").insert({ kind, starts_at: new Date(when).toISOString(), duration_min: kind === "phone" ? 30 : 60, staff: staff || null });
    if (error) toast({ title: error.message, variant: "destructive" });
    else { setWhen(""); load(); }
  };

  const release = async (id: string) => {
    const { error } = await supabase.from("hiring_slots").update({ status: "open", applicant_id: null, booked_at: null }).eq("id", id);
    if (error) toast({ title: error.message, variant: "destructive" });
    else load();
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Hiring slots</h1>
      <div className="rounded-xl border border-border bg-card p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Kind</label>
          <div className="flex gap-2 mt-1">
            <Button size="sm" variant={kind === "phone" ? "default" : "outline"} onClick={() => setKind("phone")}><Phone className="h-4 w-4 mr-1" />Phone</Button>
            <Button size="sm" variant={kind === "in_person" ? "default" : "outline"} onClick={() => setKind("in_person")}><MapPin className="h-4 w-4 mr-1" />In person</Button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">When</label>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Staff</label>
          <Input value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="Justin" className="mt-1 w-32" />
        </div>
        <Button onClick={add} disabled={!when}><Plus className="h-4 w-4 mr-1" />Add slot</Button>
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
        <div className="grid gap-2">
          {slots.length === 0 ? <p className="text-muted-foreground">No upcoming slots. The scheduler seeds phone and Saturday in-person slots automatically.</p> : null}
          {slots.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                {s.kind === "phone" ? <Phone className="h-4 w-4 text-primary" /> : <MapPin className="h-4 w-4 text-primary" />}
                <div>
                  <p className="text-sm font-medium text-foreground">{fmt(s.starts_at)} <span className="text-muted-foreground">· {s.duration_min} min{s.staff ? ` · ${s.staff}` : ""}</span></p>
                  <p className="text-xs text-muted-foreground">{s.kind === "phone" ? "Phone screen" : "In person"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${s.status === "open" ? "bg-green-100 text-green-800" : s.status === "booked" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>{s.status}</span>
                {s.status === "booked" ? <Button size="sm" variant="outline" onClick={() => release(s.id)}>Release</Button> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
