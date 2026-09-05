/**
 * ProKitPanel — applicant-drawer entry point for the Pro Intake & Kit Order.
 *
 * Creates a pro_kit row with a fresh random token, shows the copyable public
 * link, the status chip, and the editable kit record (submitted answers plus
 * the admin-only compliance and fulfilment fields).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, Loader2, Send, PackageCheck } from "lucide-react";
import ProKitEditor, { KIT_STATUS_LABEL, type ProKitRow } from "./ProKitEditor";

const STATUS_PILL: Record<string, string> = {
  sent: "bg-slate-100 text-slate-700 ring-slate-200",
  submitted: "bg-amber-100 text-amber-800 ring-amber-200",
  kit_ordered: "bg-sky-100 text-sky-800 ring-sky-200",
  kit_issued: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export default function ProKitPanel({ applicantId }: { applicantId: string }) {
  const [kit, setKit] = useState<ProKitRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showKit, setShowKit] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("pro_kit")
      .select("*")
      .eq("applicant_id", applicantId)
      .order("created_at", { ascending: false })
      .limit(1);
    setKit(((data ?? [])[0] as ProKitRow) ?? null);
    setLoading(false);
  };

  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [applicantId]);

  const create = async () => {
    setCreating(true);
    const { data, error } = await supabase
      .from("pro_kit")
      .insert({ applicant_id: applicantId })
      .select("*")
      .single();
    setCreating(false);
    if (error) return toast({ title: "Could not create intake", description: error.message, variant: "destructive" });
    setKit(data as ProKitRow);
    toast({ title: "Intake form created", description: "Copy the link and send it to the Pro." });
  };

  const link = kit ? `https://jointidy.co/intake/${kit.token}` : "";

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <PackageCheck className="h-4 w-4" /> Pro Intake &amp; Kit Order
        </h3>
        {kit && (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STATUS_PILL[kit.status] ?? STATUS_PILL.sent}`}>
            {KIT_STATUS_LABEL[kit.status] ?? kit.status}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking…
        </div>
      ) : !kit ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Sends the sizing, vehicle, compliance and availability form the kit order is built from.
          </p>
          <button
            onClick={create}
            disabled={creating}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send intake form
          </button>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{link}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(link); toast({ title: "Link copied" }); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold text-foreground"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {kit.submitted_at ? `Submitted ${new Date(kit.submitted_at).toLocaleString()}` : "Not submitted yet"}
          </p>
          <button
            onClick={() => setShowKit((s) => !s)}
            className="mt-3 text-xs font-bold underline text-foreground"
          >
            {showKit ? "Hide kit record" : "Open kit record"}
          </button>
          {showKit && <ProKitEditor kit={kit} onSaved={load} />}
        </>
      )}
    </div>
  );
}
