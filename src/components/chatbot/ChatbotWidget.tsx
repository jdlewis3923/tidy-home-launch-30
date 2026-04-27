import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const TIDY_PHONE = "(786) 829-1141";
const TIDY_PHONE_TEL = "+17868291141";
const VISITOR_KEY = "tidy_chat_visitor_id";
const NAME_KEY = "tidy_chat_name";
const EMAIL_KEY = "tidy_chat_email";

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi! I'm Tidy's concierge assistant 👋 Ask me anything about cleaning, lawn care, detailing, pricing, or our service area.",
};

function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "ssr";
  let v = localStorage.getItem(VISITOR_KEY);
  if (!v) {
    v = "v_" + crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, v);
  }
  return v;
}

function TypingDots() {
  return (
    <span
      className="inline-flex items-center gap-1 py-1"
      role="status"
      aria-label="Assistant is typing"
    >
      <span className="h-1.5 w-1.5 animate-billing-bounce rounded-full bg-foreground/60" />
      <span
        className="h-1.5 w-1.5 animate-billing-bounce rounded-full bg-foreground/60"
        style={{ animationDelay: "0.15s" }}
      />
      <span
        className="h-1.5 w-1.5 animate-billing-bounce rounded-full bg-foreground/60"
        style={{ animationDelay: "0.3s" }}
      />
    </span>
  );
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showCallback, setShowCallback] = useState(false);
  const [cbName, setCbName] = useState("");
  const [cbPhone, setCbPhone] = useState("");
  const [cbSubmitting, setCbSubmitting] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const visitorIdRef = useRef<string>(getOrCreateVisitorId());

  // Subscribe to admin replies for THIS conversation via Realtime.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`support_msg_${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as {
            sender_type: string;
            body: string;
            direction: string;
          };
          // Only render admin replies (AI replies already returned inline).
          if (row.sender_type === "admin") {
            setMessages((prev) => [...prev, { role: "assistant", content: row.body }]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, showCallback]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setSending(true);

    try {
      const storedName = typeof window !== "undefined" ? localStorage.getItem(NAME_KEY) : null;
      const storedEmail = typeof window !== "undefined" ? localStorage.getItem(EMAIL_KEY) : null;
      const { data: sess } = await supabase.auth.getUser();
      const authedEmail = sess?.user?.email ?? null;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-message`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          visitor_id: visitorIdRef.current,
          message: text,
          email: authedEmail || storedEmail,
          name: storedName,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || "Couldn't reach Tidy. Try again or call " + TIDY_PHONE);
      }

      if (data.conversation_id) setConversationId(data.conversation_id);
      if (data.escalated) setEscalated(true);

      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: data.reply || "" };
        return copy;
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Something went wrong";
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: errMsg };
        return copy;
      });
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  const submitCallback = useCallback(async () => {
    if (!cbPhone.trim() || cbSubmitting) return;
    setCbSubmitting(true);
    const lastUserQ = [...messages].reverse().find((m) => m.role === "user")?.content ?? null;
    const { error } = await supabase.from("chatbot_leads").insert({
      name: cbName.trim() || null,
      phone: cbPhone.trim(),
      question: lastUserQ,
      source_page: typeof window !== "undefined" ? window.location.pathname : null,
    });
    setCbSubmitting(false);
    if (error) {
      toast.error("Couldn't send — please call " + TIDY_PHONE);
      return;
    }
    if (typeof window !== "undefined") {
      if (cbName.trim()) localStorage.setItem(NAME_KEY, cbName.trim());
    }
    toast.success("Thanks! We'll reach out shortly.");
    setShowCallback(false);
    setCbName("");
    setCbPhone("");
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Got it — we'll call you at ${cbPhone}. In the meantime, you can reach us anytime at ${TIDY_PHONE}.`,
      },
    ]);
  }, [cbName, cbPhone, cbSubmitting, messages]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close chat" : "Open chat with Tidy assistant"}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-all hover:scale-105 active:scale-95",
          "ring-4 ring-primary/20",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div
          className={cn(
            "fixed bottom-24 right-5 z-50 flex w-[calc(100vw-2.5rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl",
            "h-[min(560px,calc(100vh-8rem))] animate-in fade-in slide-in-from-bottom-4 duration-200",
          )}
        >
          <div className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <div className="text-sm font-semibold">Tidy Concierge</div>
              <div className="text-xs opacity-80">
                {escalated ? "A teammate is on the way" : "Usually replies instantly"}
              </div>
            </div>
            <a
              href={`tel:${TIDY_PHONE_TEL}`}
              className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium hover:bg-primary-foreground/25"
            >
              <Phone className="h-3 w-3" /> Call
            </a>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground",
                  )}
                >
                  {m.content ||
                    (m.role === "assistant" && sending && i === messages.length - 1 ? (
                      <TypingDots />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin opacity-60" />
                    ))}
                </div>
              </div>
            ))}

            {escalated && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
                A human will be with you soon. You can also call us at {TIDY_PHONE}.
              </div>
            )}

            {showCallback && (
              <div className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="mb-2 text-xs font-semibold">Request a callback</div>
                <Input
                  placeholder="Your name (optional)"
                  value={cbName}
                  onChange={(e) => setCbName(e.target.value)}
                  className="mb-2 h-9 text-sm"
                />
                <Input
                  placeholder="Phone number *"
                  type="tel"
                  inputMode="tel"
                  value={cbPhone}
                  onChange={(e) => setCbPhone(e.target.value)}
                  className="mb-2 h-9 text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={submitCallback}
                    disabled={!cbPhone.trim() || cbSubmitting}
                  >
                    {cbSubmitting ? "Sending..." : "Request callback"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCallback(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {!showCallback && (
            <div className="flex flex-wrap gap-1.5 border-t bg-muted/30 px-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCallback(true)}
                className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted"
              >
                📞 Request callback
              </button>
              <a
                href={`tel:${TIDY_PHONE_TEL}`}
                className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted"
              >
                Call {TIDY_PHONE}
              </a>
            </div>
          )}

          <form
            className="flex items-center gap-2 border-t bg-background p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about pricing, areas, services..."
              rows={1}
              className="min-h-[40px] resize-none text-sm"
              disabled={sending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sending}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
