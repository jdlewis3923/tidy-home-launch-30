/** Admin — Reservations (/admin/reservations). Founding reservations in reservation order, with Convert. */
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReservationsForecast, { useReservations, type ReservationRow } from "@/components/admin/ReservationsForecast";
import { RESERVATION_SERVICE_LABEL, type ReservableService } from "@/lib/launch";

const SIZE_WORD: Record<string, string> = { "1": "S1", "2": "S2", "3": "S3", quote: "quote" };
const HEARD: Record<string, string> = { door_hanger: "Door hanger", nextdoor: "Nextdoor", google: "Google", referral: "Referral", other: "Other" };

export default function AdminReservations() {
  const { rows, reload } = useReservations();
  const [open, setOpen] = useState<ReservationRow | null>(null);
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Reservations | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-6xl space-y-6">
        <div><h1 className="text-2xl font-black tracking-tight text-foreground">Reservations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Founding reservations in the order they came in — fill routes in this order.</p></div>
        <ReservationsForecast />
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-testid="reservations-table">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
              {["#", "Member", "Services · size · cadence", "ZIP", "Preferred", "Est. $/mo", "Heard", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {(rows ?? []).map((r, i) => (
                <tr key={r.id} className="border-t border-border align-top" data-testid="reservation-row">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2"><div className="font-semibold">{r.first_name} {r.last_name}{r.is_test_row && <span className="ml-1 text-xs text-destructive">TEST</span>}</div><div className="text-xs text-muted-foreground">{r.email} · {r.phone}</div><div className="text-xs text-muted-foreground">{r.street}</div></td>
                  <td className="px-3 py-2 text-xs">{r.services.map((s) => {
                    const l = r.lines.find((x) => x.service === s);
                    return <div key={s}>{RESERVATION_SERVICE_LABEL[s as ReservableService] ?? s} · {l?.size != null ? SIZE_WORD[String(l.size)] ?? l.size : "—"} · {l?.cadence ?? "—"}{r.waitlist_services.includes(s) && <span className="ml-1 font-semibold text-destructive">waitlist</span>}</div>;
                  })}</td>
                  <td className="px-3 py-2 tabular-nums">{r.zip}</td>
                  <td className="px-3 py-2 text-xs">{r.preferred_day} · {r.preferred_time}</td>
                  <td className="px-3 py-2 tabular-nums">${(r.monthly_cents / 100).toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs">{HEARD[r.heard_from] ?? r.heard_from}{r.heard_other ? ` · ${r.heard_other}` : ""}</td>
                  <td className="px-3 py-2 text-xs">{r.status}{r.invited_at && <div className="text-muted-foreground">sent {new Date(r.invited_at).toLocaleDateString()}</div>}{r.assigned_day && <div className="text-muted-foreground">{r.assigned_day}, {r.assigned_window} · {r.assigned_pro_first_name}</div>}</td>
                  <td className="px-3 py-2">{r.status !== "converted" && r.status !== "canceled" && <Button size="sm" onClick={() => setOpen(r)}>{r.invited_at ? "Resend" : "Convert"}</Button>}</td>
                </tr>
              ))}
              {rows && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No reservations yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {open && <ConvertDialog r={open} onClose={() => { setOpen(null); reload(); }} />}
    </main>
  );
}

function ConvertDialog({ r, onClose }: { r: ReservationRow; onClose: () => void }) {
  const [day, setDay] = useState(r.assigned_day ?? (r.preferred_day === "Any day" ? "" : r.preferred_day));
  const [win, setWin] = useState(r.assigned_window ?? (r.preferred_time === "morning" ? "9–11 AM" : "1–3 PM"));
  const [pro, setPro] = useState(r.assigned_pro_first_name ?? "");
  const [preview, setPreview] = useState<{ subject: string; html: string; sms: string; to: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const call = async (action: "preview" | "convert") => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("reservation-admin", { body: { action, id: r.id, day, window: win, pro_first_name: pro } });
    setBusy(false);
    if (error || !data?.ok) { setResult(`Failed: ${data?.error ?? error?.message}`); return; }
    if (action === "preview") setPreview(data); else setResult(`Sent · email ${data.email} · text ${data.sms}`);
  };
  const ok = day.length >= 3 && win.length >= 3 && pro.length >= 1;
  const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Convert {r.first_name}'s reservation</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">Day<input className={input} value={day} onChange={(e) => setDay(e.target.value)} placeholder="Tuesday" /></label>
          <label className="text-xs">Time window<input className={input} value={win} onChange={(e) => setWin(e.target.value)} /></label>
          <label className="text-xs">Pro first name<input className={input} value={pro} onChange={(e) => setPro(e.target.value)} /></label>
        </div>
        <p className="text-xs text-muted-foreground">Sends one email{r.sms_consent ? " and one text" : " (no text — they didn't opt in)"} with a personal link to a prefilled checkout.</p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!ok || busy} onClick={() => call("preview")}>Preview</Button>
          <Button disabled={!ok || busy || !preview || !!result?.startsWith("Sent")} onClick={() => { if (confirm(`Send the Convert email${r.sms_consent ? " and text" : ""} to ${r.first_name}?`)) call("convert"); }}>Send</Button>
        </div>
        {result && <p className={`text-sm font-semibold ${result.startsWith("Sent") ? "text-primary" : "text-destructive"}`} data-testid="convert-result">{result}</p>}
        {preview && (<div className="space-y-2">
          <p className="text-xs"><b>To:</b> {preview.to} · <b>Subject:</b> {preview.subject}</p>
          <p className="rounded border border-border bg-muted/40 p-2 text-xs"><b>Text:</b> {preview.sms}</p>
          <iframe title="Email preview" srcDoc={preview.html} className="h-[520px] w-full rounded border border-border bg-background" />
        </div>)}
      </DialogContent>
    </Dialog>
  );
}
