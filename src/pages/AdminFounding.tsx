/** Admin — Founding registry (/admin/founding). Numbers are never reused; the cap counts homes ever granted. */
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FOUNDING_ZIPS, FOUNDING_CAP } from "@/lib/launch";

type Row = {
  grant_id: string; founding_zip: string; founding_number: number; name: string | null; address: string | null; email: string | null;
  granted_at: string; services: string[] | null; rate_card_version: number; monthly_cents: number | null; status: string; current_zip: string | null;
};
const SVC: Record<string, string> = { cleaning: "Cleaning", lawn: "Lawn", detailing: "Car Care" };

export default function AdminFounding() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc("admin_founding_registry").then(({ data, error }) => { if (error) setErr(error.message); setRows((data as Row[]) ?? []); });
  }, []);
  const zips = FOUNDING_ZIPS as readonly string[];
  const byZip = useMemo(() => Object.fromEntries(zips.map((z) => [z, rows.filter((r) => r.founding_zip === z)])), [rows, zips]);

  const exportCsv = () => {
    const head = ["zip", "founding_number", "name", "address", "email", "join_date", "services", "rate_card_version", "monthly_total", "status", "current_zip"];
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) => [r.founding_zip, r.founding_number, r.name, r.address, r.email, r.granted_at.slice(0, 10), (r.services ?? []).join(" + "),
      r.rate_card_version, r.monthly_cents != null ? (r.monthly_cents / 100).toFixed(2) : "", r.status, r.current_zip].map(q).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `tidy-founding-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Founding homes | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-2xl font-black tracking-tight text-foreground">Founding homes</h1>
            <p className="mt-1 text-sm text-muted-foreground">Rate-locked forever. A cancelled home's number stays retired.</p></div>
          <Button onClick={exportCsv} disabled={rows.length === 0}>Export CSV</Button>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {zips.map((z) => {
          const list = byZip[z] ?? [];
          return (
            <section key={z} className="rounded-lg border border-border bg-card" data-testid={`founding-zip-${z}`}>
              <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
                <h2 className="text-lg font-bold">{z}</h2>
                <p className="text-sm font-semibold tabular-nums">{list.length} of {FOUNDING_CAP} granted · {Math.max(FOUNDING_CAP - list.length, 0)} remaining</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
                    {["#", "Name", "Address", "Joined", "Services", "Rate card", "Monthly", "Status"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {list.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-muted-foreground">No founding homes yet.</td></tr>}
                    {list.map((r) => (
                      <tr key={r.grant_id} className="border-t border-border">
                        <td className="px-3 py-2 font-bold tabular-nums">{r.founding_number}</td>
                        <td className="px-3 py-2">{r.name}<div className="text-xs text-muted-foreground">{r.email}</div></td>
                        <td className="px-3 py-2 text-xs">{r.address}{r.current_zip && r.current_zip !== r.founding_zip && <div className="text-muted-foreground">Moved to {r.current_zip}</div>}</td>
                        <td className="px-3 py-2 tabular-nums text-xs">{new Date(r.granted_at).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-xs">{(r.services ?? []).map((s) => SVC[s] ?? s).join(" + ")}</td>
                        <td className="px-3 py-2 tabular-nums">v{r.rate_card_version}</td>
                        <td className="px-3 py-2 tabular-nums">{r.monthly_cents != null ? `$${(r.monthly_cents / 100).toFixed(2)}` : "—"}</td>
                        <td className="px-3 py-2"><span className={r.status === "active" ? "font-semibold text-primary" : "text-muted-foreground"}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
