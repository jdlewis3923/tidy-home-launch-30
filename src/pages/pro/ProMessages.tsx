/** Message Tidy — /pro/messages. One live thread per Pro; admins answer from the inbox. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProShell from "@/components/pro/portal/ProShell";
import { ProButton } from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { supabase } from "@/integrations/supabase/client";

type Msg = { id: string; sender_type: string; body: string; created_at: string };

export default function ProMessages() {
  const { userId } = useProSession();
  const [params] = useSearchParams();
  const visitId = params.get("visit");
  const [convId, setConvId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data: conv } = await supabase.from("support_conversations").select("id").eq("pro_user_id", userId).maybeSingle();
    if (!conv) return;
    setConvId(conv.id);
    const { data } = await supabase.from("support_messages").select("id, sender_type, body, created_at")
      .eq("conversation_id", conv.id).order("created_at", { ascending: true }).limit(200);
    setMsgs((data ?? []) as Msg[]);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!convId) return;
    const ch = supabase.channel(`pro_msgs_${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `conversation_id=eq.${convId}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Msg).id) ? m : [...m, p.new as Msg])))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [convId]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("pro_send_message", { _body: text, _visit_id: visitId ?? undefined });
    setBusy(false);
    if (error) { setErr("Message didn't send. Try again, or call (786) 829-1141."); return; }
    setText("");
    await load();
  };

  return (
    <ProShell title="Message Tidy" back={visitId ? `/pro/visit/${visitId}` : "/pro/profile"}>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-[hsl(var(--pro-ink-soft))]">
          Tidy reads every message live. For an emergency, call 911 first. / Tidy lee cada mensaje en vivo. En una emergencia, llame primero al 911.
        </p>
        <div className="min-h-[200px] space-y-2">
          {msgs.length === 0 && <p className="py-8 text-center text-[14px] text-[hsl(var(--pro-ink-soft))]">No messages yet / Aún no hay mensajes</p>}
          {msgs.map((m) => {
            const mine = m.sender_type === "pro";
            return (
              <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] ${mine ? "ml-auto bg-[hsl(var(--pro-blue))] text-white" : "bg-white text-[hsl(var(--pro-ink))] border border-[hsl(var(--pro-navy)/0.07)]"}`}>
                {!mine && <p className="text-[11px] font-bold uppercase opacity-70">Tidy</p>}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-[11px] opacity-70">{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
              </div>
            );
          })}
          <div ref={end} />
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3}
          placeholder="Write to Tidy… / Escriba a Tidy…"
          className="w-full rounded-xl border border-[hsl(var(--pro-navy)/0.07)] bg-white p-3 text-[16px]" />
        {err && <p className="text-[14px] font-semibold text-[hsl(var(--pro-red))]">{err}</p>}
        <ProButton full disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? "Sending…" : "Send / Enviar"}</ProButton>
      </div>
    </ProShell>
  );
}
