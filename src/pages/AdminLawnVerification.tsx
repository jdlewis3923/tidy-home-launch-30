/**
 * /admin/lawn-verification — measure every lawn reservation's turf from aerial
 * imagery before it can convert. Turf only: never house, driveway, walkways,
 * patio, pool or decking. The band is derived in the database.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { lawnBandFromSqFt, LAWN_SIZE_NAMES, type CanonSize } from "@/lib/pricing-canon";

type Row = {
  id: string; created_at: string; first_name: string; last_name: string; email: string; street: string; city: string; zip: string;
  status: string; founding: boolean | null; founding_number: number | null; lawn_selected_size: string | null;
  lawn_measured_sqft: number | null; lawn_verified_size: string | null; lawn_verified_at: string | null;
  lawn_size_confirmation: string | null; is_test_row: boolean;
};

const sizeName = (s: string | null) => (s === "custom" ? "Custom quote" : s ? LAWN_SIZE_NAMES[Number(s) as CanonSize] : "—");

export default function AdminLawnVerification() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [recent, setRecent] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const cols = "id, created_at, first_name, last_name, email, street, city, zip, status, founding, founding_number, lawn_selected_size, lawn_measured_sqft, lawn_verified_size, lawn_verified_at, lawn_size_confirmation, is_test_row";

  const load = useCallback(async () => {
    const [{ data: q, error }, { data: done }] = await Promise.all([
      supabase.from("reservations").select(cols).contains("services", ["lawn"]).is("lawn_verified_at", null).in("status", ["reserved", "invited"]).order("created_at", { ascending: true }),
      supabase.from("reservations").select(cols).contains("services", ["lawn"]).not("lawn_verified_at", "is", null).order("lawn_verified_at", { ascending: false }).limit(25),
    ]);
    if (error) { toast.error("Admins only"); setRows([]); return; }
    setRows((q ?? []) as Row[]);
    setRecent((done ?? []) as Row[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Rows whose entered measurement changes the size sort to the top, in amber.
  const sorted = useMemo(() => {
    const list = (rows ?? []).map((r) => {
      const n = Number(draft[r.id]);
      const derived = n > 0 ? lawnBandFromSqFt(n) : null;
      const differs = derived !== null && derived !== (r.lawn_selected_size ?? "custom");
      return { r, derived, differs };
    });
    return [...list.filter((x) => x.differs), ...list.filter((x) => !x.differs)];
  }, [rows, draft]);

  async function verify(r: Row) {
    const n = Math.round(Number(draft[r.id]));
    if (!(n > 0)) { toast.error("Enter the measured turf sq ft"); return; }
    setBusy(r.id);
    const { data, error } = await supabase.functions.invoke("lawn-verification", { body: { action: "verify", reservation_id: r.id, measured_sqft: n } });
    setBusy(null);
    if (error || !data?.ok) { toast.error(`Not saved: ${data?.error ?? error?.message ?? "error"}`); return; }
    const k = data.result.kind as string;
    toast.success(k === "size_up" ? `Moved up to ${sizeName(data.result.verified_size)} — waiting on customer confirmation (email ${data.email_status})`
      : k === "size_down" ? `Moved down to ${sizeName(data.result.verified_size)} — customer told (email ${data.email_status})`
      : k === "quote" ? `Over 12,000 sq ft — custom quote (email ${data.email_status})` : "Verified — size matches");
    setDraft((d) => { const c = { ...d }; delete c[r.id]; return c; });
    void load();
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Lawn verification | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Lawn verification</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Measure turf only from aerial imagery — never the house, driveway, walkways, patio, pool or decking. Small ≤ 3,000 · Standard ≤ 7,000 · Large ≤ 12,000 · above 12,000 is a custom quote.
            A lawn reservation cannot convert until it is verified. Size-ups wait for the customer to confirm; size-downs apply automatically.
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground" data-testid="lawn-unverified-count">{rows ? `${rows.length} unverified` : "Loading…"}</p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-testid="lawn-queue">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
              {["Reserved", "Customer", "Address", "ZIP", "Selected", "Measured turf sq ft", "Verified size", ""].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {sorted.map(({ r, derived, differs }) => (
                <tr key={r.id} data-testid="lawn-row" data-differs={differs || undefined} className={`border-t border-border align-top ${differs ? "bg-gold/15" : ""}`}>
                  <td className="px-3 py-2 text-xs tabular-nums">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2"><div className="font-semibold">{r.first_name} {r.last_name}{r.is_test_row && <span className="ml-1 text-xs text-destructive">TEST</span>}</div><div className="text-xs text-muted-foreground">{r.email}{r.founding ? ` · Founding #${r.founding_number ?? "—"}` : ""}</div></td>
                  <td className="px-3 py-2 text-xs">{r.street}{r.city ? `, ${r.city}` : ""}</td>
                  <td className="px-3 py-2 tabular-nums">{r.zip}</td>
                  <td className="px-3 py-2">{sizeName(r.lawn_selected_size ?? "custom")}</td>
                  <td className="px-3 py-2"><Input aria-label={`Measured turf sq ft for ${r.first_name}`} inputMode="numeric" type="number" min={1} className="w-32" value={draft[r.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))} /></td>
                  <td className={`px-3 py-2 font-semibold ${differs ? "text-foreground" : "text-muted-foreground"}`} data-testid="derived-size">{derived ? sizeName(derived) : "—"}{differs && <div className="text-xs font-medium">differs from selected</div>}</td>
                  <td className="px-3 py-2"><Button size="sm" disabled={busy === r.id || !(Number(draft[r.id]) > 0)} onClick={() => verify(r)}>Save</Button></td>
                </tr>
              ))}
              {rows && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Every lawn reservation is verified.</td></tr>}
            </tbody>
          </table>
        </div>

        {recent.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-bold">Recently verified</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {recent.map((r) => (
                <li key={r.id}>{r.first_name} {r.last_name} · {r.zip} · ~{r.lawn_measured_sqft?.toLocaleString()} sq ft · {sizeName(r.lawn_selected_size)} → <strong>{sizeName(r.lawn_verified_size)}</strong> · {r.lawn_size_confirmation === "pending" ? "waiting on customer" : r.lawn_size_confirmation ?? "—"} · {r.status}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
