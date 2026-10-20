/** Text thread with a candidate: their replies + Tidy's texts, with a reply box (sends from the Tidy number). */
import { useCallback, useEffect, useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Ev = { id: string; reason: string | null; metadata: Record<string, unknown> | null; created_at: string };

export default function CandidateTexts({ id }: { id: string }) {
  const [rows, setRows] = useState<Ev[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const through = new Date().toISOString();
    const { data, error } = await supabase.from("contractor_stage_events").select("id, reason, metadata, created_at")
      .eq("applicant_id", id).eq("kind", "message").order("created_at", { ascending: true }).limit(200);
    if (error) return;
    setRows(((data ?? []) as Ev[]).filter((r) => typeof r.metadata?.text === "string" || r.metadata?.direction === "inbound"));
    if (data?.length) await supabase.rpc("admin_mark_candidate_texts_read", { _id: id, _through: through });
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [rows.length]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("candidate-text", { body: { applicant_id: id, body: text } });
    setBusy(false);
    if (error) {
      const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
      toast.error(`Text didn't send: ${details.slice(0, 160)}`);
      return;
    }
    toast.success("Sent from the Tidy number.");
    setText("");
    void load();
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-semibold">Texts</h2>
      <p className="text-xs text-muted-foreground">Replies show here within 15 seconds. You send from the Tidy number.</p>
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No texts yet.</p>}
        {rows.map((r) => {
          const out = r.metadata?.direction === "outbound";
          const body = typeof r.metadata?.text === "string" ? r.metadata.text : (r.reason ?? "");
          return (
            <div key={r.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${out ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
              <p className="whitespace-pre-wrap">{body}</p>
              <p className="mt-1 text-[11px] opacity-70">{new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{out && r.metadata?.ok === false ? " · failed" : ""}</p>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <Textarea className="mt-3" rows={3} maxLength={1200} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a text…" />
      <Button className="mt-2 w-full" disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? "Sending…" : "Send text"}</Button>
    </section>
  );
}
