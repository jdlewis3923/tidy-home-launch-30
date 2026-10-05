/** Command → first panel: door-hanger reservations, scans, conversion, drop-off, expansion waitlist. */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOUNDING_ZIPS, RESERVABLE_SERVICES, RESERVATION_SERVICE_LABEL } from "@/lib/launch";

type Ev = { session_id: string; event: string; step: string | null; src: string | null; zip: string | null };
const STEPS = ["page_view", "sizes", "price", "reserve", "reserved"] as const;
const STEP_LABEL: Record<string, string> = { page_view: "Landed", sizes: "Picked services", price: "Saw price", reserve: "Opened form", reserved: "Reserved" };

export default function FoundingFunnelPanel() {
  const q = useQuery({
    queryKey: ["founding-funnel"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [res, ev, wl] = await Promise.all([
        supabase.from("reservations").select("zip, services, src, founding, custom_quote").neq("status", "canceled").eq("is_test_row", false),
        supabase.from("founding_events").select("session_id, event, step, src, zip").order("created_at", { ascending: false }).limit(20000),
        supabase.from("waitlist").select("email, zip, source, requested_at").like("source", "founding%").order("requested_at", { ascending: false }).limit(200),
      ]);
      return { res: res.data ?? [], ev: (ev.data ?? []) as Ev[], wl: wl.data ?? [] };
    },
  });
  if (!q.data) return <section className="admin-page-surface rounded-lg border p-4 text-sm text-muted-foreground">Loading reservations…</section>;
  const { res, ev, wl } = q.data;

  const count = (z: string, s: string) => res.filter((r) => r.zip === z && (r.services as string[]).includes(s)).length;
  // Scan sessions per ZIP × src, with conversion.
  const sessions = new Map<string, { src: string; zip: string; converted: boolean }>();
  for (const e of [...ev].reverse()) {
    const cur = sessions.get(e.session_id) ?? { src: e.src || "(none)", zip: e.zip || "(unknown)", converted: false };
    if (e.zip && cur.zip === "(unknown)") cur.zip = e.zip;
    if (e.event === "reserved") cur.converted = true;
    sessions.set(e.session_id, cur);
  }
  const bySrc = new Map<string, { scans: number; res: number }>();
  for (const s of sessions.values()) {
    const k = `${s.zip}|${s.src}`;
    const v = bySrc.get(k) ?? { scans: 0, res: 0 };
    v.scans++; if (s.converted) v.res++;
    bySrc.set(k, v);
  }
  const reached = (step: string) => new Set(ev.filter((e) => (step === "page_view" || step === "reserved" ? e.event === step : e.event === "step" && e.step === step)).map((e) => e.session_id)).size;
  const funnel = STEPS.map((s) => ({ s, n: reached(s) }));
  const calls = ev.filter((e) => e.event === "tap_to_call").length;

  return (
    <section className="admin-page-surface rounded-lg border p-4 space-y-5" aria-label="Founding reservations">
      <h2 className="text-base font-bold">Founding reservations</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">ZIP</th>{RESERVABLE_SERVICES.map((s) => <th key={s}>{RESERVATION_SERVICE_LABEL[s]}</th>)}</tr></thead>
          <tbody>
            {FOUNDING_ZIPS.map((z) => (
              <tr key={z} className="border-t border-border"><td className="py-1 font-semibold">{z}</td>
                {RESERVABLE_SERVICES.map((s) => { const n = count(z, s); return <td key={s}>{n}{n >= 10 && <span className="ml-2 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">HIRE</span>}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted-foreground">HIRE = 10+ reservations for that service in that ZIP (contractor hiring trigger). Custom quotes awaiting price: {res.filter((r) => r.custom_quote).length}.</p>
      </div>

      <div className="overflow-x-auto">
        <h3 className="text-sm font-semibold">Scans → reservations</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">ZIP</th><th>src</th><th>Scans</th><th>Reserved</th><th>Conv.</th></tr></thead>
          <tbody>
            {[...bySrc.entries()].sort((a, b) => b[1].scans - a[1].scans).map(([k, v]) => { const [z, s] = k.split("|"); return (
              <tr key={k} className="border-t border-border"><td className="py-1">{z}</td><td>{s}</td><td>{v.scans}</td><td>{v.res}</td><td>{v.scans ? `${Math.round((v.res / v.scans) * 100)}%` : "—"}</td></tr>
            ); })}
            {bySrc.size === 0 && <tr><td colSpan={5} className="py-2 text-muted-foreground">No scans yet.</td></tr>}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted-foreground">Tap-to-call: {calls}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Quote drop-off</h3>
        <ol className="mt-1 space-y-1 text-sm">
          {funnel.map(({ s, n }, i) => (
            <li key={s} className="flex justify-between border-t border-border py-1"><span>{STEP_LABEL[s]}</span><span>{n}{i > 0 && funnel[i - 1].n ? <span className="ml-2 text-xs text-muted-foreground">{Math.round((n / funnel[i - 1].n) * 100)}% of previous</span> : null}</span></li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Out-of-area waitlist ({wl.length})</h3>
        <ul className="mt-1 max-h-40 overflow-y-auto text-sm">
          {wl.map((w, i) => <li key={i} className="flex justify-between border-t border-border py-1"><span>{w.email}</span><span className="text-muted-foreground">{w.zip}</span></li>)}
          {wl.length === 0 && <li className="text-muted-foreground">None yet.</li>}
        </ul>
      </div>
    </section>
  );
}
