/**
 * /admin/documenso-templates — admin pastes Documenso template IDs for the
 * 3 contractor envelopes. The send-documenso-envelope edge function reads
 * these to know which template to clone per applicant.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type Row = { doc_type: string; template_id: string | null; label: string };

export default function AdminDocumensoTemplates() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("documenso_templates")
        .select("doc_type, template_id, label")
        .order("doc_type");
      if (error) {
        toast({ title: "Failed to load", description: error.message, variant: "destructive" });
      } else {
        setRows((data ?? []) as Row[]);
      }
      setLoading(false);
    })();
  }, [toast]);

  const save = async (docType: string, templateId: string) => {
    setSaving(docType);
    const { error } = await supabase
      .from("documenso_templates")
      .update({ template_id: templateId.trim() || null })
      .eq("doc_type", docType);
    setSaving(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `${docType} template updated` });
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Documenso Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One bundled envelope per service role (cleaning, lawn, detail).
            Each applicant signs the single envelope matching their service.
            Paste the template ID from Documenso (Templates → ⋯ → Copy template ID).
          </p>
        </header>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <Card key={r.doc_type} className="p-4">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label htmlFor={r.doc_type} className="text-sm font-medium">
                      {r.label}{" "}
                      <span className="text-xs text-muted-foreground">({r.doc_type})</span>
                    </Label>
                    <Input
                      id={r.doc_type}
                      defaultValue={r.template_id ?? ""}
                      placeholder="e.g. 12345"
                      onChange={(e) => {
                        setRows((prev) =>
                          prev.map((x) =>
                            x.doc_type === r.doc_type ? { ...x, template_id: e.target.value } : x,
                          ),
                        );
                      }}
                      className="mt-2"
                    />
                  </div>
                  <Button
                    onClick={() => save(r.doc_type, r.template_id ?? "")}
                    disabled={saving === r.doc_type}
                  >
                    {saving === r.doc_type ? "Saving…" : "Save"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
