/**
 * Admin Orientations — /admin/orientations
 *
 * Schedule + run group orientations. For each session, register applicants
 * (added from /admin/applicants drawer) and bulk-mark attendance. Saving
 * attendance fires advance-applicant action='mark_oriented' for every
 * checked attendee.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Navigate, Link } from "react-router-dom";
import { CalendarDays, Plus, Loader2, ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Orientation = {
  id: string;
  scheduled_at: string;
  location: string | null;
  capacity: number;
  notes: string | null;
};

type Attendee = {
  id: string;
  applicant_id: string;
  attended: boolean;
  registered_at: string;
  applicant: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    service: string | null;
    current_stage: string | null;
  } | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function AdminOrientations() {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [orientations, setOrientations] = useState<Orientation[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);

  // New-orientation dialog
  const [showNew, setShowNew] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newLocation, setNewLocation] = useState("Tidy HQ — Pinecrest, FL");
  const [newCapacity, setNewCapacity] = useState(8);
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const loadOrientations = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("orientations")
      .select("id, scheduled_at, location, capacity, notes")
      .gte("scheduled_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 30 * 6).toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setOrientations((data as Orientation[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (hasRole) loadOrientations(); }, [hasRole, loadOrientations]);

  const loadAttendees = useCallback(async (orientationId: string) => {
    setAttendeesLoading(true);
    const { data, error } = await (supabase as any)
      .from("orientation_attendees")
      .select("id, applicant_id, attended, registered_at, applicant:applicants(id, first_name, last_name, email, service, current_stage)")
      .eq("orientation_id", orientationId)
      .order("registered_at", { ascending: true });
    if (error) toast.error(error.message);
    setAttendees((data as Attendee[]) ?? []);
    setAttendeesLoading(false);
  }, []);

  useEffect(() => {
    if (openId) loadAttendees(openId);
    else setAttendees([]);
  }, [openId, loadAttendees]);

  const upcoming = useMemo(
    () => orientations.filter((o) => new Date(o.scheduled_at) >= new Date()).sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
    [orientations],
  );
  const past = useMemo(
    () => orientations.filter((o) => new Date(o.scheduled_at) < new Date()).sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)),
    [orientations],
  );

  const toggleAttended = (attendeeId: string, checked: boolean) => {
    setAttendees((prev) => prev.map((a) => (a.id === attendeeId ? { ...a, attended: checked } : a)));
  };

  const saveAttendance = async () => {
    if (!openId) return;
    setSavingAttendance(true);
    const justChecked = attendees.filter((a) => a.attended);

    // 1. Persist attended flags.
    const { error: upErr } = await (supabase as any)
      .from("orientation_attendees")
      .upsert(attendees.map((a) => ({ id: a.id, orientation_id: openId, applicant_id: a.applicant_id, attended: a.attended })));
    if (upErr) { toast.error(`Save failed: ${upErr.message}`); setSavingAttendance(false); return; }

    // 2. Fire advance-applicant mark_oriented for each checked applicant whose
    //    current_stage is not yet 'oriented' or beyond.
    const advanceTargets = justChecked.filter(
      (a) => a.applicant && !["oriented", "active", "rejected"].includes(a.applicant.current_stage ?? ""),
    );
    let advanced = 0;
    for (const a of advanceTargets) {
      const { error } = await supabase.functions.invoke("advance-applicant", {
        body: { applicant_id: a.applicant_id, action: "mark_oriented" },
      });
      if (error) console.error("mark_oriented failed for", a.applicant_id, error);
      else advanced++;
    }

    setSavingAttendance(false);
    toast.success(`Attendance saved · ${advanced} applicants advanced to 'oriented'`);
    await loadAttendees(openId);
  };

  const createOrientation = async () => {
    if (!newDate) { toast.error("Pick a date/time"); return; }
    setCreating(true);
    const { error } = await (supabase as any).from("orientations").insert({
      scheduled_at: new Date(newDate).toISOString(),
      location: newLocation || null,
      capacity: newCapacity,
      notes: newNotes || null,
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Orientation scheduled");
    setShowNew(false);
    setNewDate(""); setNewNotes("");
    loadOrientations();
  };

  if (roleLoading) return <div className="p-8 text-slate-300">Loading…</div>;
  if (!hasRole) return <Navigate to="/" replace />;

  const openOri = orientations.find((o) => o.id === openId) ?? null;

  return (
    <div className="min-h-screen bg-slate-50 pl-20 pr-6 pt-16 pb-10">
      <Helmet><title>Group Orientations · Tidy Admin</title></Helmet>
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <Link to="/admin/applicants" className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-2">
              <ArrowLeft className="h-3 w-3" /> Applicants
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Group Orientations</h1>
            <p className="text-sm text-slate-500 mt-1">Schedule sessions, register applicants, mark attendance.</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold">
            <Plus className="h-4 w-4 mr-1" /> Schedule new orientation
          </Button>
        </header>

        {loading ? (
          <div className="text-slate-400 text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            <section>
              <h2 className="text-sm uppercase tracking-wide text-slate-500 font-semibold mb-3">Upcoming ({upcoming.length})</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {upcoming.length === 0 ? (
                  <div className="text-slate-400 text-sm">No upcoming orientations.</div>
                ) : upcoming.map((o) => (
                  <Card key={o.id} className="cursor-pointer hover:border-amber-300 transition" onClick={() => setOpenId(o.id)}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                        <CalendarDays className="h-5 w-5 text-amber-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900">{fmtDate(o.scheduled_at)}</div>
                        <div className="text-xs text-slate-500 truncate">{o.location ?? "Location TBD"} · capacity {o.capacity}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-sm uppercase tracking-wide text-slate-500 font-semibold mb-3">Past 6 months ({past.length})</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {past.length === 0 ? (
                  <div className="text-slate-400 text-sm">No past orientations.</div>
                ) : past.map((o) => (
                  <Card key={o.id} className="cursor-pointer hover:border-slate-300 transition opacity-90" onClick={() => setOpenId(o.id)}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                        <CalendarDays className="h-5 w-5 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-700">{fmtDate(o.scheduled_at)}</div>
                        <div className="text-xs text-slate-500 truncate">{o.location ?? "—"}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Orientation detail dialog */}
      <Dialog open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openOri ? fmtDate(openOri.scheduled_at) : "Orientation"}</DialogTitle>
          </DialogHeader>
          {openOri && (
            <div className="space-y-3 text-sm">
              <div className="text-slate-600">{openOri.location ?? "—"} · capacity {openOri.capacity}</div>
              {openOri.notes && <div className="text-xs text-slate-500 italic">{openOri.notes}</div>}

              <div className="border-t border-slate-200 pt-3">
                <div className="font-semibold text-slate-900 mb-2">Registered ({attendees.length}/{openOri.capacity})</div>
                {attendeesLoading ? (
                  <div className="text-slate-400 text-xs"><Loader2 className="h-3 w-3 animate-spin inline mr-1" /> loading…</div>
                ) : attendees.length === 0 ? (
                  <div className="text-slate-400 text-sm">No applicants registered yet. Add them from <Link to="/admin/applicants" className="text-[#1FA1F0] hover:underline">Applicants</Link>.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {attendees.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {a.applicant ? `${a.applicant.first_name} ${a.applicant.last_name}` : "(unknown applicant)"}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{a.applicant?.email} · {a.applicant?.service ?? "—"} · {a.applicant?.current_stage}</div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <Checkbox
                            checked={a.attended}
                            onCheckedChange={(v) => toggleAttended(a.id, !!v)}
                          />
                          Attended
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenId(null)}>Close</Button>
            <Button
              disabled={savingAttendance || attendees.length === 0}
              onClick={saveAttendance}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {savingAttendance ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Save attendance & advance</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New orientation dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Schedule new orientation</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs text-slate-600 font-medium">Date & time</label>
              <Input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">Location</label>
              <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Tidy HQ — Pinecrest, FL" />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">Capacity</label>
              <Input type="number" min={1} max={50} value={newCapacity} onChange={(e) => setNewCapacity(parseInt(e.target.value || "8", 10))} />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">Notes</label>
              <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={createOrientation} disabled={creating} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
