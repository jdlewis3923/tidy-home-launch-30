/**
 * Admin Leads & Requests — /admin/leads
 *
 * Read-only view of the three write-only capture tables:
 *   - waitlist          (out-of-area emails from the ZIP gate)
 *   - support_requests  (in-app help modals from the customer dashboard)
 *   - chatbot_leads     (callback requests from the chatbot widget)
 *
 * Admin-only: RLS restricts SELECT to has_role(auth.uid(),'admin'); the client
 * also redirects non-admins, matching the other /admin pages.
 */
import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

type WaitlistRow = {
  id: string;
  email: string;
  zip: string | null;
  source: string | null;
  requested_at: string;
};

type SupportRow = {
  id: string;
  user_id: string;
  type: string;
  payload: unknown;
  status: string | null;
  created_at: string;
};

type ChatbotRow = {
  id: string;
  name: string | null;
  phone: string;
  question: string | null;
  source_page: string | null;
  created_at: string;
};

const fmtDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const fmtPayload = (p: unknown): string => {
  if (p == null) return "—";
  if (typeof p === "string") return p;
  try {
    return Object.entries(p as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" · ");
  } catch {
    return String(p);
  }
};

const AdminLeads = () => {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [loading, setLoading] = useState(true);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);
  const [support, setSupport] = useState<SupportRow[]>([]);
  const [chatbot, setChatbot] = useState<ChatbotRow[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [w, s, c] = await Promise.all([
      supabase.from("waitlist").select("*").order("requested_at", { ascending: false }),
      supabase.from("support_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("chatbot_leads").select("*").order("created_at", { ascending: false }),
    ]);
    const err = w.error ?? s.error ?? c.error;
    if (err) {
      toast({ title: "Failed to load", description: err.message, variant: "destructive" });
    }
    setWaitlist((w.data ?? []) as WaitlistRow[]);
    setSupport((s.data ?? []) as SupportRow[]);
    setChatbot((c.data ?? []) as ChatbotRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasRole) void fetchAll();
  }, [hasRole, fetchAll]);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!hasRole) {
    return <Navigate to="/" replace />;
  }

  const empty = (cols: number, label: string) => (
    <TableRow>
      <TableCell colSpan={cols} className="text-center text-slate-400 py-6">
        {label}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Helmet>
        <title>Leads &amp; Requests — Tidy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="border-b border-white/10 bg-slate-900/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="text-white/70 hover:text-white">
              <Link to="/admin/kpis">
                <ArrowLeft className="h-4 w-4 mr-1" /> KPIs
              </Link>
            </Button>
            <h1 className="text-xl font-semibold">Leads &amp; Requests</h1>
            <Badge variant="outline" className="border-amber-400/40 text-amber-300">Admin</Badge>
          </div>
          <Button
            onClick={() => void fetchAll()}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Waitlist */}
        <Card className="bg-slate-900/60 border-white/10">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Waitlist</CardTitle>
            <Badge variant="secondary">{waitlist.length} rows</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>ZIP</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waitlist.length === 0
                  ? empty(4, loading ? "Loading…" : "No waitlist signups yet.")
                  : waitlist.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.email}</TableCell>
                        <TableCell>{r.zip ?? "—"}</TableCell>
                        <TableCell>{r.source ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.requested_at)}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Support requests */}
        <Card className="bg-slate-900/60 border-white/10">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Support Requests</CardTitle>
            <Badge variant="secondary">{support.length} rows</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {support.length === 0
                  ? empty(5, loading ? "Loading…" : "No support requests yet.")
                  : support.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.type}</TableCell>
                        <TableCell>{r.status ?? "—"}</TableCell>
                        <TableCell className="max-w-md whitespace-pre-wrap break-words">
                          {fmtPayload(r.payload)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.user_id}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Chatbot leads */}
        <Card className="bg-slate-900/60 border-white/10">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Chatbot Leads</CardTitle>
            <Badge variant="secondary">{chatbot.length} rows</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chatbot.length === 0
                  ? empty(5, loading ? "Loading…" : "No chatbot leads yet.")
                  : chatbot.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.phone}</TableCell>
                        <TableCell className="max-w-md whitespace-pre-wrap break-words">
                          {r.question ?? "—"}
                        </TableCell>
                        <TableCell>{r.source_page ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminLeads;
