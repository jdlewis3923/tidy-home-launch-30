/** /admin/pipeline/archive — declined and withdrawn candidates. Restore puts them back where they were. */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money, rpcMessage, serviceLabel, stageLabel } from "@/lib/pipeline";

type Row = { applicant_id: string; name: string; email: string | null; phone: string | null; service: string | null; stage: string; state: string; reason: string | null; archived_at: string | null; spend_cents: number };

export default function AdminPipelineArchive() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const load = async (term: string) => {
    const { data, error } = await (supabase as any).rpc("pipeline_archive_list", { _q: term || null });
    if (error) toast.error(rpcMessage(error)); else setRows(data ?? []);
  };
  useEffect(() => { const t = setTimeout(() => void load(q), 250); return () => clearTimeout(t); }, [q]);
  const restore = async (id: string) => {
    const { error } = await (supabase as any).rpc("pipeline_restore", { _id: id });
    if (error) toast.error(rpcMessage(error)); else { toast.success("Restored."); void load(q); }
  };
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <Helmet><title>Pipeline archive | Tidy Admin</title></Helmet>
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-black tracking-tight text-foreground">Pipeline archive</h1>
        <Input aria-label="Search" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Name", "Service", "Left at", "Why", "Spent", ""].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">Nothing archived.</td></tr>}
              {rows.map((r) => (
                <tr key={r.applicant_id} className="border-t border-border">
                  <td className="px-3 py-2"><Link className="font-semibold text-primary" to={`/admin/pipeline/${r.applicant_id}`}>{r.name}</Link><div className="text-xs text-muted-foreground">{r.email}</div></td>
                  <td className="px-3 py-2">{serviceLabel(r.service)}</td>
                  <td className="px-3 py-2">{stageLabel(r.stage)}</td>
                  <td className="px-3 py-2">{r.state === "withdrawn" ? "Withdrew" : r.reason ?? "No reason recorded"}<div className="text-xs text-muted-foreground">{r.archived_at ? new Date(r.archived_at).toLocaleDateString() : ""}</div></td>
                  <td className="px-3 py-2 tabular-nums">{money(r.spend_cents)}</td>
                  <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => restore(r.applicant_id)}>Restore</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
