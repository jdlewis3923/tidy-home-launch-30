/**
 * /admin/chatbot-knowledge — paste/edit the business deck the chatbot answers from.
 *
 * Reads the latest `chatbot_knowledge` row (publicly readable), and updates it
 * in place. Updates are gated server-side by `has_role(auth.uid(), 'admin')`
 * via RLS, so non-admins get a Postgres 42501 / empty result.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function AdminChatbotKnowledge() {
  const [content, setContent] = useState("");
  const [rowId, setRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setForbidden(true);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("chatbot_knowledge")
        .select("id, content, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        toast.error("Failed to load knowledge");
        setLoading(false);
        return;
      }
      if (data) {
        setRowId(data.id);
        setContent(data.content);
        setUpdatedAt(data.updated_at);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!content.trim()) {
      toast.error("Knowledge can't be empty");
      return;
    }
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;

    let error: { message: string } | null = null;
    if (rowId) {
      const res = await supabase
        .from("chatbot_knowledge")
        .update({ content, updated_at: new Date().toISOString(), updated_by: uid })
        .eq("id", rowId)
        .select("id, updated_at")
        .maybeSingle();
      error = res.error;
      if (res.data) setUpdatedAt(res.data.updated_at);
    } else {
      const res = await supabase
        .from("chatbot_knowledge")
        .insert({ content, updated_by: uid })
        .select("id, updated_at")
        .maybeSingle();
      error = res.error;
      if (res.data) {
        setRowId(res.data.id);
        setUpdatedAt(res.data.updated_at);
      }
    }

    setSaving(false);
    if (error) {
      toast.error("Save failed (admin only): " + error.message);
      return;
    }
    toast.success("Knowledge updated — chatbot will use it on the next message.");
  };

  if (forbidden) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in as an admin to edit the chatbot knowledge base.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Chatbot Knowledge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the full Tidy business deck below. The concierge chatbot answers
          customer questions using only this content. Be specific — include
          pricing tiers, service areas, hours, what's included, FAQs, anything
          you'd want a new hire to know.
        </p>
        {updatedAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            Last updated: {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
            placeholder="Paste your business deck content here…"
            className="font-mono text-sm"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {content.length.toLocaleString()} characters
            </span>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save knowledge"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
