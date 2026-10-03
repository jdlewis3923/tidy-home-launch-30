/**
 * Admin → Review Bonuses. Record a Google review, see the four checks, approve.
 * The server (approve_review_bonus) re-runs every check; this view only explains them.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { REVIEW_BONUS_LINE } from "@/lib/reviewBonus";

type Member = { user_id: string; first_name: string | null; last_name: string | null };
type Pro = { id: string; first_name: string | null; last_name: string | null };
type Checks = {
  member_has_completed_visit: boolean; pro_served_member: boolean; rating_is_five: boolean;
  member_not_used: boolean; ok: boolean; payout_date: string;
};

const LABELS: Array<[keyof Checks, string]> = [
  ["member_has_completed_visit", "Member has a completed visit"],
  ["pro_served_member", "The Pro named served this member"],
  ["rating_is_five", "Rating is 5 stars"],
  ["member_not_used", "Member has no review bonus yet"],
];

export default function ReviewBonusRecorder({ pros, onApproved }: { pros: Pro[]; onApproved?: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [member, setMember] = useState("");
  const [pro, setPro] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stars, setStars] = useState(5);
  const [text, setText] = useState("");
  const [checks, setChecks] = useState<Checks | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from("profiles").select("user_id, first_name, last_name").order("first_name").limit(2000)
      .then(({ data }) => setMembers((data ?? []) as Member[]));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? members.filter((m) => `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLowerCase().includes(s)).slice(0, 50) : members.slice(0, 50);
  }, [members, q]);

  useEffect(() => {
    if (!member || !pro) { setChecks(null); return; }
    void supabase.rpc("review_bonus_precheck", { _member: member, _pro: pro, _stars: stars })
      .then(({ data }) => setChecks((data as Checks) ?? null));
  }, [member, pro, stars]);

  async function approve() {
    if (!checks?.ok) return;
    if (!window.confirm("Approve a $25 Review bonus for this Pro's next Friday payout?")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("approve_review_bonus", {
      _member: member, _pro: pro, _review_date: date, _stars: stars, _review_text: text || null,
    });
    setBusy(false);
    const res = data as { ok: boolean; checks?: Checks; payout_date?: string } | null;
    if (error || !res?.ok) {
      if (res?.checks) setChecks(res.checks);
      toast.error("Not approved", { description: error?.message ?? "A check failed — see the list." });
      return;
    }
    toast.success(`Review bonus added — $25 on ${res.payout_date}`);
    setText(""); setChecks(null); setMember(""); onApproved?.();
  }

  const name = (p: { first_name: string | null; last_name: string | null }) => `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";

  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid="review-bonus-recorder">
      <h2 className="text-sm font-bold">Review Bonuses — record a Google review</h2>
      <p className="mt-1 text-xs text-muted-foreground">{REVIEW_BONUS_LINE}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Member
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <select aria-label="Member" value={member} onChange={(e) => setMember(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="">Choose member…</option>
            {filtered.map((m) => <option key={m.user_id} value={m.user_id}>{name(m)}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Pro named
          <select aria-label="Pro named" value={pro} onChange={(e) => setPro(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            <option value="">Choose Pro…</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Review date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-semibold">Star rating
          <select aria-label="Star rating" value={stars} onChange={(e) => setStars(Number(e.target.value))} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} ★</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold sm:col-span-2">Review text (paste)
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        </label>
      </div>
      {checks && (
        <ul className="mt-3 space-y-1">
          {LABELS.map(([k, l]) => (
            <li key={k} className={`flex items-center gap-2 text-xs ${checks[k] ? "text-foreground" : "text-destructive font-semibold"}`}>
              {checks[k] ? <Check className="h-3.5 w-3.5 text-primary" /> : <X className="h-3.5 w-3.5" />} {l}
            </li>
          ))}
        </ul>
      )}
      <button onClick={approve} disabled={!checks?.ok || busy} className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">
        {busy ? "Approving…" : checks?.ok ? `Approve — $25 on ${checks.payout_date}` : "Approve"}
      </button>
    </div>
  );
}
