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

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi! I'm Tidy's concierge assistant 👋 Ask me anything about cleaning, lawn care, detailing, pricing, or our service area.",
};

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showCallback, setShowCallback] = useState(false);
  const [cbName, setCbName] = useState("");
  const [cbPhone, setCbPhone] = useState("");
  const [cbSubmitting, setCbSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming, showCallback]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: next.filter((m) => m.content.trim().length > 0),
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          throw new Error("Lots of folks asking right now — try again in a moment.");
        }
        if (resp.status === 402) {
          throw new Error("Service temporarily unavailable. Please call us at " + TIDY_PHONE);
        }
        throw new Error("Couldn't reach the assistant. Try again or call " + TIDY_PHONE);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let done = false;

      while (!done) {
        const { done: chunkDone, value } = await reader.read();
        if (chunkDone) break;
        buffer += decoder.decode(value, { stream: true });
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Something went wrong";
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: errMsg };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming]);

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
      {/* Floating button */}
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

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed bottom-24 right-5 z-50 flex w-[calc(100vw-2.5rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl",
            "h-[min(560px,calc(100vh-8rem))] animate-in fade-in slide-in-from-bottom-4 duration-200",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <div className="text-sm font-semibold">Tidy Concierge</div>
              <div className="text-xs opacity-80">Usually replies instantly</div>
            </div>
            <a
              href={`tel:${TIDY_PHONE_TEL}`}
              className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium hover:bg-primary-foreground/25"
            >
              <Phone className="h-3 w-3" /> Call
            </a>
          </div>

          {/* Messages */}
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
                  {m.content || (
                    <Loader2 className="h-4 w-4 animate-spin opacity-60" />
                  )}
                </div>
              </div>
            ))}

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

          {/* Quick actions */}
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

          {/* Input */}
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
              disabled={streaming}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || streaming}
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
