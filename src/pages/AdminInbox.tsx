// Admin Unified Support Inbox: SMS + web chat in one place, with realtime updates.
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, MessageCircle, Smartphone, User, Bot, Shield, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Channel = "sms" | "web";
type Status = "open" | "resolved" | "escalated";
type Direction = "inbound" | "outbound" | "auto_reply";
type SenderType = "customer" | "ai" | "admin";

type Conversation = {
  id: string;
  channel: Channel;
  customer_phone_e164: string | null;
  customer_email: string | null;
  customer_name: string | null;
  visitor_id: string | null;
  status: Status;
  last_message_at: string;
  ai_handled_count: number;
  created_at: string;
};

type Message = {
  id: string;
  conversation_id: string;
  direction: Direction;
  sender_type: SenderType;
  body: string;
  ai_confidence: number | null;
  twilio_sid: string | null;
  created_at: string;
};

type Filter = "all" | "open" | "escalated" | "resolved";

function senderIcon(t: SenderType) {
  if (t === "customer") return <User className="h-3.5 w-3.5" />;
  if (t === "ai") return <Bot className="h-3.5 w-3.5" />;
  return <Shield className="h-3.5 w-3.5" />;
}

function channelIcon(c: Channel) {
  return c === "sms" ? (
    <Smartphone className="h-3.5 w-3.5" />
  ) : (
    <MessageCircle className="h-3.5 w-3.5" />
  );
}

function customerLabel(c: Conversation) {
  if (c.customer_name) return c.customer_name;
  if (c.customer_phone_e164) return c.customer_phone_e164;
  if (c.customer_email) return c.customer_email;
  if (c.visitor_id) return c.visitor_id.slice(0, 14) + "…";
  return "Unknown";
}

export default function AdminInbox() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authed, setAuthed] = useState<"checking" | "yes" | "no">("checking");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get("c"));
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);

  // Auth/admin gate
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        setAuthed("no");
        navigate("/login?next=/admin/inbox");
        return;
      }
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setAuthed(role ? "yes" : "no");
    })();
  }, [navigate]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from("support_conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Couldn't load conversations: " + error.message);
      return;
    }
    setConversations((data || []) as Conversation[]);
  }, []);

  useEffect(() => {
    if (authed !== "yes") return;
    loadConversations();
  }, [authed, loadConversations]);

  // Realtime: refresh list on any conversation change
  useEffect(() => {
    if (authed !== "yes") return;
    const ch = supabase
      .channel("admin_inbox_conv")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_conversations" },
        () => loadConversations(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authed, loadConversations]);

  // Load messages for active conversation
  const loadMessages = useCallback(async (id: string) => {
    setLoadingConv(true);
    const { data, error } = await supabase
      .from("support_messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    setLoadingConv(false);
    if (error) {
      toast.error("Couldn't load messages: " + error.message);
      return;
    }
    setMessages((data || []) as Message[]);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    loadMessages(activeId);
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      sp.set("c", activeId);
      return sp;
    });
  }, [activeId, loadMessages, setSearchParams]);

  // Realtime: append new messages for active conversation
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase
      .channel(`admin_inbox_msg_${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeId]);

  const filtered = useMemo(() => {
    let list = conversations;
    if (filter !== "all") list = list.filter((c) => c.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) =>
        [c.customer_name, c.customer_phone_e164, c.customer_email, c.visitor_id]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [conversations, filter, search]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  );

  const sendReply = useCallback(async () => {
    if (!active || !reply.trim() || sending) return;
    setSending(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-admin-reply`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversation_id: active.id, body: reply.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Send failed");
      setReply("");
      toast.success(active.channel === "sms" ? "SMS sent" : "Reply posted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, [active, reply, sending]);

  const setStatus = useCallback(
    async (id: string, status: Status) => {
      const { error } = await supabase
        .from("support_conversations")
        .update({ status })
        .eq("id", id);
      if (error) toast.error(error.message);
      else loadConversations();
    },
    [loadConversations],
  );

  if (authed === "checking") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (authed === "no") {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Admins only.
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Support Inbox — Tidy Admin</title>
      </Helmet>
      <div className="flex h-screen flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold">Support Inbox</h1>
            <Badge variant="outline">{conversations.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {(["all", "open", "escalated", "resolved"] as Filter[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Conversation list */}
          <aside className="flex w-[340px] flex-col border-r">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name / phone / email"
                  className="pl-8 text-sm"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No conversations yet.
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((c) => (
                    <li
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        "cursor-pointer p-3 hover:bg-muted/50",
                        activeId === c.id && "bg-muted",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          {channelIcon(c.channel)}
                          <span className="truncate">{customerLabel(c)}</span>
                        </div>
                        {c.status === "escalated" && (
                          <Badge variant="destructive" className="text-[10px]">
                            ESC
                          </Badge>
                        )}
                        {c.status === "resolved" && (
                          <Badge variant="secondary" className="text-[10px]">
                            ✓
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{format(new Date(c.last_message_at), "MMM d, h:mm a")}</span>
                        {c.ai_handled_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            {c.ai_handled_count}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </aside>

          {/* Thread */}
          <section className="flex flex-1 flex-col">
            {!active ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Select a conversation
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {channelIcon(active.channel)}
                      {customerLabel(active)}
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {active.channel}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {active.customer_email && <span>{active.customer_email} · </span>}
                      AI handled {active.ai_handled_count}x · status {active.status}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {active.status !== "open" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(active.id, "open")}>
                        Reopen
                      </Button>
                    )}
                    {active.status !== "resolved" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(active.id, "resolved")}>
                        Mark resolved
                      </Button>
                    )}
                  </div>
                </div>

                <ScrollArea className="flex-1 px-4">
                  {loadingConv ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3 py-4">
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            "flex",
                            m.sender_type === "customer" ? "justify-start" : "justify-end",
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                              m.sender_type === "customer"
                                ? "rounded-bl-sm bg-muted"
                                : m.sender_type === "ai"
                                  ? "rounded-br-sm bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100"
                                  : "rounded-br-sm bg-primary text-primary-foreground",
                            )}
                          >
                            <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70">
                              {senderIcon(m.sender_type)}
                              {m.sender_type}
                              {typeof m.ai_confidence === "number" && (
                                <span className="ml-1">
                                  · {(m.ai_confidence * 100).toFixed(0)}%
                                </span>
                              )}
                              <span className="ml-auto">
                                {format(new Date(m.created_at), "h:mm a")}
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap">{m.body}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                <form
                  className="flex items-end gap-2 border-t p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendReply();
                  }}
                >
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder={`Reply via ${active.channel.toUpperCase()}…  (⌘/Ctrl+Enter to send)`}
                    className="min-h-[60px] flex-1 text-sm"
                    disabled={sending}
                  />
                  <Button type="submit" disabled={!reply.trim() || sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
