/** /admin/reviews/import — paste/CSV import for Adapter A (manual reviews). */
import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useHasRoleState } from "@/hooks/useHasRole";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
    return row;
  });
}

export default function AdminReviewsImport() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const [raw, setRaw] = useState("name,stars,date,text\nJane Doe,5,2024-05-01,Great work from Mike!\n");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (isLoading) return null;
  if (!hasRole) return <Navigate to="/" replace />;

  const handleImport = async () => {
    setBusy(true);
    setResult(null);
    try {
      const rows = parseCsv(raw).map((r) => ({
        reviewer_name: r.name || r.reviewer_name,
        stars: Number(r.stars || r.rating),
        posted_at: r.date || r.posted_at,
        comment: r.text || r.comment,
        external_review_id: r.external_review_id || undefined,
      }));
      const { data, error } = await supabase.functions.invoke("reviews-import", { body: { rows } });
      if (error) throw new Error(error.message);
      setResult(data);
      toast.success(`Imported ${data?.inserted ?? 0} review(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-foreground">Import reviews (paste/CSV)</h1>
          <Link to="/admin/reviews" className="text-sm underline text-muted-foreground">Back to reviews</Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Columns: <code>name, stars, date, text</code> (or <code>external_review_id</code> to force a stable dedupe key).
          Rows without an id are deduped on a hash of reviewer name + date + first 60 chars of the review.
        </p>
        <textarea
          className="w-full h-64 rounded-lg border border-border bg-card p-3 font-mono text-xs"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <button
          onClick={handleImport}
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import rows"}
        </button>
        {result && (
          <pre className="rounded-lg border border-border bg-muted p-3 text-xs overflow-auto max-h-80">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
