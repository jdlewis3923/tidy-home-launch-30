/**
 * LegalReviewPanel — open legal review items, plus the count of Pros who have
 * signed the vehicle advertising agreement. The agreement and the ICA go to a
 * lawyer before the tenth signature.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Scale, Loader2 } from "lucide-react";

type Item = {
  id: string;
  title: string;
  detail: string | null;
  document_ref: string | null;
  trigger_note: string | null;
  status: string;
};

const REVIEW_THRESHOLD = 10;

export default function LegalReviewPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [signed, setSigned] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase.from("legal_review_items").select("*").eq("status", "open").order("created_at"),
      supabase.from("pro_kit").select("id", { count: "exact", head: true }).not("vehicle_ad_signed_at", "is", null),
    ]);
    setItems((data ?? []) as Item[]);
    setSigned(count ?? 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resolve = async (id: string) => {
    const { error } = await supabase
      .from("legal_review_items")
      .update({ status: "reviewed", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast({ title: "Could not update", description: error.message, variant: "destructive" });
    toast({ title: "Marked reviewed" });
    load();
  };

  if (loading) {
    return (
      <div className="admin-page-surface flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading legal review…
      </div>
    );
  }
  if (items.length === 0) return null;

  const due = signed >= REVIEW_THRESHOLD - 2;

  return (
    <div className="admin-page-surface rounded-lg border p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Scale className="h-4 w-4" /> Legal review — before the {REVIEW_THRESHOLD}th signed Pro
      </h2>
      <p className={`mt-1 text-xs ${due ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>
        {signed} of {REVIEW_THRESHOLD} Pros have signed the vehicle advertising agreement.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((i) => (
          <li key={i.id} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{i.title}</p>
                {i.detail && <p className="mt-0.5 text-xs text-muted-foreground">{i.detail}</p>}
                {i.document_ref && <p className="mt-1 text-[11px] text-muted-foreground">{i.document_ref}</p>}
              </div>
              <button
                onClick={() => resolve(i.id)}
                className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold"
              >
                Mark reviewed
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
