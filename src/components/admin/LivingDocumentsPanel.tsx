import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LIVING_DOCS } from "@/lib/livingDocs";
import { loadDocSources, syncLivingDocSearch } from "@/pages/AdminLivingDocument";
import { toast } from "@/hooks/use-toast";

/** Living documents render from the source of truth; this list links to each one. */
export default function LivingDocumentsPanel({ onSynced }: { onSynced?: () => void }) {
  const [busy, setBusy] = useState(false);
  const groups = [...new Set(LIVING_DOCS.map((d) => d.category))];
  const sync = async () => {
    setBusy(true);
    try { await syncLivingDocSearch(await loadDocSources()); toast({ title: "Search updated for all living documents" }); onSynced?.(); }
    finally { setBusy(false); }
  };
  return (
    <Card><CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto"><h2 className="text-lg font-semibold">Living documents</h2>
          <p className="text-sm text-muted-foreground">Built from current prices, scope, kit and agreements. English and Spanish, with Download PDF.</p></div>
        <Button size="sm" variant="outline" onClick={sync} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}Refresh search</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g}><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
            <ul className="space-y-1">{LIVING_DOCS.filter((d) => d.category === g).map((d) => (
              <li key={d.slug}><Link className="inline-flex items-center gap-1 text-sm text-primary hover:underline" to={`/admin/documents/${d.slug}`}><FileText className="h-3.5 w-3.5" />{d.title[0]}</Link></li>))}</ul></div>
        ))}
      </div>
    </CardContent></Card>
  );
}
