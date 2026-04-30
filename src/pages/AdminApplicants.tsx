/**
 * Admin Applicants Pipeline — /admin/applicants
 *
 * Professional ATS-style redesign:
 * - Header bar with title, count, Export CSV, + Add manually
 * - 4 stat cards (Applied / BG Check / Interview / Active)
 * - Filter bar: search + status chips + role + ZIP
 * - Card-style row list with avatar, name/email, role badge, ZIP chip,
 *   status pill, BG dot, relative applied date, hover affordance
 * - Slide-over detail drawer (Sheet) with header / quick-info /
 *   Background Check card / Pipeline stepper / Activity Timeline / Docs / Reject
 * - Loading skeletons, friendly empty state, confirm-before-reject modal
 * - Mobile responsive
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Loader2, ShieldCheck, ShieldAlert, ShieldX,
  Search, Download, Plus, Copy, Check, MapPin, Briefcase, Clock,
  Mail, Phone as PhoneIcon, FileText, UserPlus, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ---------- Types ----------
type Applicant = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  service: string | null;
  zip: string | null;
  experience_years: number | null;
  has_vehicle: boolean | null;
  has_supplies: boolean | null;
  current_stage: string | null;
  stage_entered_at: string | null;
  bg_check_status: string | null;
  bg_check_provider: string | null;
  bg_check_notes: string | null;
  bg_check_completed_at: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string | null;
  notes_for_admin: string | null;
};

type AdvanceAction =
  | "clear" | "consider" | "fail"
  | "schedule_interview" | "send_offer" | "send_contract"
  | "mark_oriented" | "activate" | "reject";

// ---------- Visual maps ----------
const STAGE_LABEL: Record<string, string> = {
  applied: "Applied",
  background_check_pending: "BG Check",
  background_check_review: "BG Review",
  interview_pending: "Interview",
  offer_sent: "Offer Sent",
  contract_signed: "Contract Signed",
  oriented: "Oriented",
  active: "Active",
  rejected: "Rejected",
};

const STAGE_PILL: Record<string, string> = {
  applied: "bg-yellow-100 text-yellow-800 ring-yellow-200",
  background_check_pending: "bg-orange-100 text-orange-800 ring-orange-200",
  background_check_review: "bg-orange-100 text-orange-800 ring-orange-200",
  interview_pending: "bg-blue-100 text-blue-800 ring-blue-200",
  offer_sent: "bg-purple-100 text-purple-800 ring-purple-200",
  contract_signed: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  oriented: "bg-teal-100 text-teal-800 ring-teal-200",
  active: "bg-green-100 text-green-800 ring-green-200",
  rejected: "bg-gray-100 text-gray-700 ring-gray-200",
};

const ROLE_BADGE: Record<string, string> = {
  cleaning: "bg-sky-100 text-sky-800 ring-sky-200",
  lawn: "bg-green-100 text-green-800 ring-green-200",
  detail: "bg-slate-200 text-slate-800 ring-slate-300",
};

const BG_DOT: Record<string, string> = {
  pending: "bg-gray-400 ring-gray-200",
  clear: "bg-emerald-500 ring-emerald-200",
  consider: "bg-amber-500 ring-amber-200",
  fail: "bg-red-500 ring-red-200",
};

const PIPELINE_STEPS: Array<{ key: string; label: string }> = [
  { key: "applied", label: "Applied" },
  { key: "background_check_review", label: "BG Check" },
  { key: "interview_pending", label: "Interview" },
  { key: "offer_sent", label: "Offer" },
  { key: "contract_signed", label: "Contract" },
  { key: "oriented", label: "Orientation" },
  { key: "active", label: "Active" },
];

// ---------- Helpers ----------
function roleOf(service: string | null | undefined): "cleaning" | "lawn" | "detail" {
  const s = (service ?? "").toLowerCase();
  if (s.includes("lawn")) return "lawn";
  if (s.includes("detail") || s.includes("car")) return "detail";
  return "cleaning";
}

function initials(first: string, last: string): string {
  return `${(first?.[0] ?? "").toUpperCase()}${(last?.[0] ?? "").toUpperCase()}` || "?";
}

function avatarColor(seed: string): string {
  const palette = [
    "bg-sky-500", "bg-emerald-500", "bg-violet-500",
    "bg-amber-500", "bg-rose-500", "bg-teal-500", "bg-indigo-500",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function relTime(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function stageIndex(stage: string | null | undefined): number {
  const idx = PIPELINE_STEPS.findIndex((s) => s.key === stage);
  if (idx >= 0) return idx;
  if (stage === "background_check_pending") return 1;
  return 0;
}

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "applied", label: "Applied" },
  { key: "bg", label: "BG Check" },
  { key: "interview_pending", label: "Interview" },
  { key: "offer_sent", label: "Offer" },
  { key: "contract_signed", label: "Contract" },
  { key: "demo_passed", label: "Demo" },
  { key: "active", label: "Active" },
  { key: "rejected", label: "Rejected" },
];

// ---------- Component ----------
export default function AdminApplicants() {
  const { hasRole, isLoading: roleLoading } = useHasRoleState("admin");
  const [rows, setRows] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [zipFilter, setZipFilter] = useState<string>("all");

  const [open, setOpen] = useState<Applicant | null>(null);
  const [bgNotes, setBgNotes] = useState("");
  const [bgNotesDirty, setBgNotesDirty] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; event: string; metadata: any; created_at: string }>>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("applicants")
      .select("id, first_name, last_name, email, phone, service, zip, experience_years, has_vehicle, has_supplies, current_stage, stage_entered_at, bg_check_status, bg_check_provider, bg_check_notes, bg_check_completed_at, rejection_reason, rejected_at, created_at, updated_at, notes_for_admin")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) console.error(error);
    setRows((data as unknown as Applicant[]) ?? []);
    setLoading(false);
  }, []);

  const fetchEvents = useCallback(async (applicantId: string) => {
    setEventsLoading(true);
    const { data, error } = await (supabase as any)
      .from("onboarding_events")
      .select("id, event, metadata, created_at")
      .eq("applicant_id", applicantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) console.error(error);
    setEvents(data ?? []);
    setEventsLoading(false);
  }, []);

  useEffect(() => { if (hasRole) fetchRows(); }, [hasRole, fetchRows]);

  useEffect(() => {
    setBgNotes(open?.bg_check_notes ?? "");
    setBgNotesDirty(false);
    if (open?.id) fetchEvents(open.id);
    else setEvents([]);
  }, [open?.id, fetchEvents, open?.bg_check_notes]);

  // ----- Filtering -----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.first_name} ${r.last_name} ${r.email} ${r.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all") {
        if (statusFilter === "bg") {
          if (!["background_check_pending", "background_check_review"].includes(r.current_stage ?? "")) return false;
        } else if (r.current_stage !== statusFilter) return false;
      }
      if (roleFilter !== "all" && roleOf(r.service) !== roleFilter) return false;
      if (zipFilter !== "all" && r.zip !== zipFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter, roleFilter, zipFilter]);

  // ----- Stat cards -----
  const stats = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const fourteenDaysAgo = Date.now() - 14 * 86_400_000;
    const inGroup = (r: Applicant, fn: (s: string) => boolean) => fn(r.current_stage ?? "");
    const stage = {
      applied:   (s: string) => s === "applied",
      bg:        (s: string) => s === "background_check_pending" || s === "background_check_review",
      interview: (s: string) => s === "interview_pending",
      active:    (s: string) => s === "active",
    };
    const count = (k: keyof typeof stage) => rows.filter((r) => inGroup(r, stage[k])).length;
    const delta = (k: keyof typeof stage) => {
      const last7 = rows.filter((r) => inGroup(r, stage[k]) && new Date(r.created_at).getTime() >= sevenDaysAgo).length;
      const prev7 = rows.filter((r) => inGroup(r, stage[k]) && new Date(r.created_at).getTime() >= fourteenDaysAgo && new Date(r.created_at).getTime() < sevenDaysAgo).length;
      return last7 - prev7;
    };
    return {
      applied:   { count: count("applied"),   delta: delta("applied") },
      bg:        { count: count("bg"),        delta: delta("bg") },
      interview: { count: count("interview"), delta: delta("interview") },
      active:    { count: count("active"),    delta: delta("active") },
    };
  }, [rows]);

  const totalCount = rows.length;
  const activeCount = rows.filter((r) => r.current_stage !== "rejected").length;
  const uniqueZips = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.zip) set.add(r.zip); });
    const arr = Array.from(set).sort();
    // Always include the 3 Tidy Miami ZIPs even if empty
    ["33156", "33183", "33186"].forEach((z) => { if (!set.has(z)) arr.push(z); });
    return Array.from(new Set(arr)).sort();
  }, [rows]);

  // ----- Actions -----
  const runAction = async (action: AdvanceAction) => {
    if (!open) return;
    setSubmitting(action);
    const { data, error } = await supabase.functions.invoke("advance-applicant", {
      body: { applicant_id: open.id, action, notes: bgNotes || undefined },
    });
    setSubmitting(null);
    if (error || (data as any)?.error) {
      toast.error("Action failed", { description: error?.message ?? (data as any)?.error ?? "unknown" });
      return;
    }
    const friendly: Record<AdvanceAction, string> = {
      clear: "Background marked clear",
      consider: "Marked for review",
      fail: "Background failed — applicant rejected",
      schedule_interview: "Interview scheduled",
      send_offer: "Offer sent",
      send_contract: "Contract sent",
      mark_demo_passed: "Demo passed",
      activate: "Contractor activated",
      reject: "Applicant rejected",
    };
    toast.success(friendly[action]);
    if (open) await fetchEvents(open.id);
    fetchRows();
  };

  const saveBgNotes = async () => {
    if (!open || !bgNotesDirty) return;
    const { error } = await supabase.from("applicants")
      .update({ bg_check_notes: bgNotes }).eq("id", open.id);
    if (error) {
      toast.error("Notes failed to save");
      return;
    }
    setBgNotesDirty(false);
    toast.success("Notes saved");
  };

  const copyToClipboard = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1200);
  };

  // ----- CSV export -----
  const exportCsv = () => {
    const header = ["First","Last","Email","Phone","Role","ZIP","Stage","BG Status","Applied","Updated"];
    const lines = [header.join(",")];
    filtered.forEach((r) => {
      const row = [
        r.first_name, r.last_name, r.email, r.phone ?? "",
        roleOf(r.service), r.zip ?? "", r.current_stage ?? "",
        r.bg_check_status ?? "", r.created_at, r.updated_at ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(row.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `applicants-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  if (roleLoading) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6" /></main>;
  }
  if (!hasRole) return <Navigate to="/" replace />;

  const role = open ? roleOf(open.service) : "cleaning";
  const stepIdx = stageIndex(open?.current_stage);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Helmet><title>Applicants | Tidy Admin</title></Helmet>

      {/* ---------- Header bar ---------- */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/admin/kpis"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> KPIs</Button></Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#0D1117] tracking-tight">Applicants</h1>
              <p className="text-xs md:text-sm text-slate-500">
                Tidy hiring pipeline · {totalCount} total · {activeCount} active
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button size="sm" className="bg-[#1FA1F0] hover:bg-[#1990da] text-white"
              onClick={() => toast.info("Manual add coming soon — share /apply for now")}>
              <Plus className="h-4 w-4 mr-1" /> Add manually
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* ---------- Stat cards ---------- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard label="Applied"   count={stats.applied.count}   delta={stats.applied.delta}   tone="yellow" />
          <StatCard label="BG Check"  count={stats.bg.count}        delta={stats.bg.delta}        tone="orange" />
          <StatCard label="Interview" count={stats.interview.count} delta={stats.interview.delta} tone="blue"   />
          <StatCard label="Active"    count={stats.active.count}    delta={stats.active.delta}    tone="green"  />
        </div>

        {/* ---------- Filter bar ---------- */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, email, or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="lawn">Lawn</SelectItem>
                  <SelectItem value="detail">Detail</SelectItem>
                </SelectContent>
              </Select>
              <Select value={zipFilter} onValueChange={setZipFilter}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="ZIP" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ZIPs</SelectItem>
                  {uniqueZips.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full ring-1 transition-all ${
                  statusFilter === f.key
                    ? "bg-[#1FA1F0] text-white ring-[#1FA1F0] shadow-sm"
                    : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"
                }`}
              >{f.label}</button>
            ))}
          </div>
        </div>

        {/* ---------- List ---------- */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasAny={rows.length > 0} />
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => {
              const r = roleOf(a.service);
              const stage = a.current_stage ?? "applied";
              const bg = a.bg_check_status ?? "pending";
              return (
                <button
                  key={a.id}
                  onClick={() => setOpen(a)}
                  className="group w-full text-left bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4 shadow-sm hover:shadow-md hover:bg-blue-50/40 hover:border-blue-200 transition-all"
                >
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${avatarColor(a.id)}`}>
                    {initials(a.first_name, a.last_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#0D1117] truncate">{a.first_name} {a.last_name}</div>
                    <div className="text-xs text-slate-500 truncate">{a.email}</div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-md ring-1 capitalize ${ROLE_BADGE[r]}`}>{r}</span>
                    {a.zip && (
                      <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {a.zip}
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 shrink-0 ${STAGE_PILL[stage] ?? STAGE_PILL.applied}`}>
                    {STAGE_LABEL[stage] ?? stage}
                  </span>
                  <span className={`h-2.5 w-2.5 rounded-full ring-2 shrink-0 ${BG_DOT[bg] ?? BG_DOT.pending}`} title={`BG: ${bg}`} />
                  <span className="hidden md:inline text-xs text-slate-500 shrink-0 w-20 text-right">{relTime(a.created_at)}</span>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#1FA1F0] transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- Detail drawer ---------- */}
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="right" className="w-full sm:max-w-[720px] p-0 overflow-y-auto">
          {open && (
            <div className="flex flex-col h-full">
              <SheetHeader className="p-6 pb-4 border-b border-slate-200 bg-gradient-to-br from-white to-slate-50">
                <div className="flex items-start gap-4">
                  <div className={`h-[60px] w-[60px] rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 ${avatarColor(open.id)}`}>
                    {initials(open.first_name, open.last_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-2xl font-bold text-[#0D1117]">{open.first_name} {open.last_name}</SheetTitle>
                    <div className="mt-1 space-y-1">
                      <button onClick={() => copyToClipboard(open.email, "email")} className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#1FA1F0] group">
                        <Mail className="h-3.5 w-3.5" /><span className="truncate">{open.email}</span>
                        {copiedField === "email" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
                      </button>
                      {open.phone && (
                        <button onClick={() => copyToClipboard(open.phone!, "phone")} className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#1FA1F0] group">
                          <PhoneIcon className="h-3.5 w-3.5" /><span>{open.phone}</span>
                          {copiedField === "phone" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 ${STAGE_PILL[open.current_stage ?? "applied"]}`}>
                        {STAGE_LABEL[open.current_stage ?? "applied"]}
                      </span>
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 bg-white ring-slate-200 text-slate-700 inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${BG_DOT[open.bg_check_status ?? "pending"]}`} />
                        BG: {open.bg_check_status ?? "pending"}
                      </span>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 capitalize ${ROLE_BADGE[role]}`}>{role}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      Applied {relTime(open.created_at)} · Updated {relTime(open.updated_at ?? open.stage_entered_at ?? open.created_at)}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 p-6 space-y-5">
                {/* Quick info */}
                <div className="grid grid-cols-3 gap-3">
                  <QuickInfo icon={<Briefcase className="h-4 w-4" />} label="Role" value={role} />
                  <QuickInfo icon={<MapPin className="h-4 w-4" />} label="ZIP" value={open.zip ?? "—"} />
                  <QuickInfo icon={<Clock className="h-4 w-4" />} label="Experience" value={open.experience_years != null ? `${open.experience_years}y` : "—"} />
                </div>

                {open.notes_for_admin && (
                  <Card className="rounded-2xl border-slate-200">
                    <CardContent className="p-4">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1 font-semibold">Notes from applicant</div>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap">{open.notes_for_admin}</div>
                    </CardContent>
                  </Card>
                )}

                {/* Background check */}
                <Card className="rounded-2xl border-slate-200">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-[#0D1117]">Background Check</h3>
                      {open.bg_check_completed_at && (
                        <span className="text-[11px] text-slate-500">Completed {relTime(open.bg_check_completed_at)}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button onClick={() => runAction("clear")} disabled={!!submitting || open.bg_check_status === "clear"} className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                        {submitting === "clear" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldCheck className="h-4 w-4 mr-1" /> CLEAR</>}
                      </Button>
                      <Button onClick={() => runAction("consider")} disabled={!!submitting} className="bg-amber-500 hover:bg-amber-600 text-white">
                        {submitting === "consider" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldAlert className="h-4 w-4 mr-1" /> CONSIDER</>}
                      </Button>
                      <Button onClick={() => runAction("fail")} disabled={!!submitting} className="bg-red-600 hover:bg-red-700 text-white">
                        {submitting === "fail" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldX className="h-4 w-4 mr-1" /> FAIL</>}
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Notes (auto-saves on blur)…"
                      value={bgNotes}
                      onChange={(e) => { setBgNotes(e.target.value); setBgNotesDirty(true); }}
                      onBlur={saveBgNotes}
                      rows={3}
                    />
                  </CardContent>
                </Card>

                {/* Pipeline */}
                <Card className="rounded-2xl border-slate-200">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-semibold text-[#0D1117]">Pipeline</h3>
                    <ol className="space-y-2">
                      {PIPELINE_STEPS.map((step, i) => {
                        const done = i < stepIdx;
                        const current = i === stepIdx;
                        return (
                          <li key={step.key} className="flex items-center gap-3">
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ring-2 ${
                              done ? "bg-emerald-500 text-white ring-emerald-200"
                                : current ? "bg-[#1FA1F0] text-white ring-blue-200"
                                : "bg-slate-100 text-slate-400 ring-slate-200"
                            }`}>
                              {done ? <Check className="h-4 w-4" /> : i + 1}
                            </div>
                            <span className={`text-sm ${current ? "font-semibold text-[#0D1117]" : done ? "text-slate-600" : "text-slate-400"}`}>
                              {step.label}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                      {open.current_stage === "interview_pending" && (
                        <Button size="sm" disabled={!!submitting} onClick={() => runAction("send_offer")} className="bg-[#1FA1F0] hover:bg-[#1990da] text-white">Send offer</Button>
                      )}
                      {open.current_stage === "background_check_review" && (
                        <Button size="sm" variant="outline" disabled={!!submitting} onClick={() => runAction("schedule_interview")}>Schedule interview</Button>
                      )}
                      {open.current_stage === "offer_sent" && (
                        <Button size="sm" disabled={!!submitting} onClick={() => runAction("send_contract")} className="bg-[#1FA1F0] hover:bg-[#1990da] text-white">Send contract</Button>
                      )}
                      {open.current_stage === "contract_signed" && (
                        <Button size="sm" disabled={!!submitting} onClick={() => runAction("mark_demo_passed")} className="bg-teal-600 hover:bg-teal-700 text-white">Mark demo passed</Button>
                      )}
                      {open.current_stage === "demo_passed" && (
                        <Button size="sm" disabled={!!submitting} onClick={() => runAction("activate")} className="bg-emerald-600 hover:bg-emerald-700 text-white">Activate</Button>
                      )}
                      {/* Always allow scheduling if not yet scheduled */}
                      {!["interview_pending", "offer_sent", "contract_signed", "demo_passed", "active", "rejected"].includes(open.current_stage ?? "") && (
                        <Button size="sm" variant="outline" disabled={!!submitting} onClick={() => runAction("schedule_interview")}>Schedule interview</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Activity timeline */}
                <Card className="rounded-2xl border-slate-200">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-[#0D1117] mb-3">Activity Timeline</h3>
                    {eventsLoading ? (
                      <div className="text-slate-400 text-xs"><Loader2 className="h-3 w-3 animate-spin inline mr-1" /> loading…</div>
                    ) : events.length === 0 ? (
                      <div className="text-slate-400 text-sm">No activity yet.</div>
                    ) : (
                      <ol className="space-y-3 max-h-72 overflow-y-auto pr-1">
                        {events.map((e) => (
                          <li key={e.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="h-2.5 w-2.5 rounded-full bg-[#1FA1F0] ring-2 ring-blue-100 mt-1.5" />
                              <div className="flex-1 w-px bg-slate-200 mt-1" />
                            </div>
                            <div className="flex-1 pb-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-[#0D1117]">{e.event}</span>
                                <span className="text-[11px] text-slate-400">{relTime(e.created_at)}</span>
                              </div>
                              {e.metadata?.stage && (
                                <div className="text-xs text-slate-500">→ {e.metadata.stage}{e.metadata.role ? ` · ${e.metadata.role}` : ""}</div>
                              )}
                              {e.metadata?.notes && (
                                <div className="text-xs text-slate-600 italic mt-1">{e.metadata.notes}</div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>

                {/* Documents */}
                <Card className="rounded-2xl border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-[#0D1117]">Documents Sent</h3>
                      <Link to="/admin/documents" className="text-xs text-[#1FA1F0] hover:underline flex items-center gap-1">
                        <FileText className="h-3 w-3" /> All docs
                      </Link>
                    </div>
                    <p className="text-xs text-slate-500">PDFs attached on each transition appear in the activity timeline above.</p>
                  </CardContent>
                </Card>

                {/* Reject footer */}
                <div className="pt-4 border-t border-slate-200">
                  <button
                    onClick={() => setConfirmReject(true)}
                    disabled={!!submitting || open.current_stage === "rejected"}
                    className="text-sm text-red-600 hover:text-red-700 hover:underline disabled:opacity-40"
                  >
                    Reject Applicant
                  </button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm reject */}
      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" /> Reject this applicant?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {open ? `${open.first_name} ${open.last_name} will be moved to "Rejected" and notified by email.` : ""} This can't be undone from the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { setConfirmReject(false); await runAction("reject"); }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >Reject</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

// ---------- Subcomponents ----------
function StatCard({ label, count, delta, tone }: { label: string; count: number; delta: number; tone: "yellow"|"orange"|"blue"|"green" }) {
  const tones: Record<string, string> = {
    yellow: "from-yellow-50 to-white border-yellow-200 text-yellow-700",
    orange: "from-orange-50 to-white border-orange-200 text-orange-700",
    blue:   "from-blue-50 to-white border-blue-200 text-blue-700",
    green:  "from-green-50 to-white border-green-200 text-green-700",
  };
  const deltaSign = delta > 0 ? `+${delta}` : `${delta}`;
  const deltaColor = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-400";
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm ${tones[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-[#0D1117]">{count}</span>
        <span className={`text-xs font-medium ${deltaColor}`}>{deltaSign} 7d</span>
      </div>
    </div>
  );
}

function QuickInfo({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {icon} {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-[#0D1117] capitalize truncate">{value}</div>
    </div>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
      <div className="mx-auto h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <UserPlus className="h-8 w-8 text-[#1FA1F0]" />
      </div>
      <h3 className="text-lg font-semibold text-[#0D1117]">
        {hasAny ? "No applicants match your filters" : "No applicants yet"}
      </h3>
      <p className="text-sm text-slate-500 mt-1">
        {hasAny ? "Try clearing filters or search." : "Share your apply link to start collecting candidates."}
      </p>
      {!hasAny && (
        <Link to="/apply" className="inline-block mt-4">
          <Button className="bg-[#1FA1F0] hover:bg-[#1990da] text-white">View /apply page</Button>
        </Link>
      )}
    </div>
  );
}
