/**
 * Admin-only "View the sequence" link. Opens the current Onboarding Sequence
 * PDF (company_documents.doc_key = 'onboarding-sequence') from the private
 * company-docs bucket via a short-lived signed URL, in a new tab.
 * Never render this outside admin pages.
 */
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export async function openSequenceDoc() {
  // Open the tab synchronously so popup blockers allow it.
  const w = window.open("about:blank", "_blank");
  const { data: doc } = await supabase
    .from("company_documents")
    .select("storage_path")
    .eq("doc_key", "onboarding-sequence")
    .is("archived_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const path = (doc as { storage_path?: string } | null)?.storage_path;
  const signed = path
    ? await supabase.storage.from("company-docs").createSignedUrl(path, 300)
    : null;
  const url = signed?.data?.signedUrl;
  if (!url) {
    w?.close();
    toast.error("Could not open the sequence document");
    return;
  }
  if (w) w.location.href = url;
  else window.open(url, "_blank", "noopener");
}

export default function ViewSequenceLink({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void openSequenceDoc(); }}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold underline underline-offset-2 ${className}`}
    >
      <FileText className="h-3.5 w-3.5" /> View the sequence
    </button>
  );
}
