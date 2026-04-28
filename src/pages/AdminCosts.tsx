/**
 * /admin/costs — Operations Cost Dashboard.
 *
 * "This Month at a Glance" header (total spend, gross revenue, net margin %, biggest category)
 * + 4 expandable category cards with line items, sortable, CSV export, and add/edit forms.
 * Server-side RLS enforces admin-only access; client falls back to a 403 view on rejection.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Category = "marketing" | "contractor" | "saas" | "other";

interface CostEntry {
  id: string;
  category: Category;
  subcategory: string | null;
  vendor: string | null;
  description: string;
  amount_cents: number;
  spent_on: string;
  contractor_name: string | null;
  service_type: string | null;
  jobber_job_id: string | null;
  jobber_visit_id: string | null;
  is_bonus: boolean;
  campaign: string | null;
  channel: string | null;
  billing_cycle: string | null;
  source: string;
  external_id: string | null;
  notes: string | null;
  created_at: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  marketing: "Marketing",
  contractor: "Contractor Payouts",
  saas: "SaaS / Backend Stack",
  other: "Other",
};

const CATEGORY_TONES: Record<Category, string> = {
  marketing: "bg-amber-50 border-amber-200 text-amber-900",
  contractor: "bg-emerald-50 border-emerald-200 text-emerald-900",
  saas: "bg-sky-50 border-sky-200 text-sky-900",
  other: "bg-slate-50 border-slate-200 text-slate-900",
};

function fmtUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format(cents / 100);
}

function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end), label: start.toLocaleString("en-US", { month: "long", year: "numeric" }) };
}

const EMPTY_FORM: Partial<CostEntry> = {
  category: "marketing",
  description: "",
  amount_cents: 0,
  spent_on: new Date().toISOString().slice(0, 10),
  source: "manual",
  is_bonus: false,
};

export default function AdminCosts() {
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [revenueCents, setRevenueCents] = useState(0);
  const [expanded, setExpanded] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CostEntry | null>(null);
  const [form, setForm] = useState<Partial<CostEntry>>(EMPTY_FORM);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");

  const month = useMemo(() => monthBounds(), []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [costsRes, invRes] = await Promise.all([
        supabase
          .from("cost_entries")
          .select("*")
          .gte("spent_on", month.start)
          .lte("spent_on", month.end)
          .order("spent_on", { ascending: false }),
        supabase
          .from("invoices")
          .select("amount_cents,paid_at,status")
          .eq("status", "paid")
          .gte("paid_at", `${month.start}T00:00:00Z`)
          .lte("paid_at", `${month.end}T23:59:59Z`),
      ]);

      if (costsRes.error) {
        if (costsRes.error.code === "PGRST301" || /permission|denied|forbidden/i.test(costsRes.error.message)) {
          setForbidden(true);
          return;
        }
        throw costsRes.error;
      }
      setEntries((costsRes.data ?? []) as CostEntry[]);
      setRevenueCents((invRes.data ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [month.start, month.end]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const totals = useMemo(() => {
    const byCat: Record<Category, number> = { marketing: 0, contractor: 0, saas: 0, other: 0 };
    for (const e of entries) byCat[e.category] += e.amount_cents;
    const total = byCat.marketing + byCat.contractor + byCat.saas + byCat.other;
    const biggest = (Object.entries(byCat) as Array<[Category, number]>)
      .sort((a, b) => b[1] - a[1])[0];
    const margin = revenueCents > 0 ? ((revenueCents - total) / revenueCents) * 100 : null;
    return { byCat, total, biggest, margin };
  }, [entries, revenueCents]);

  const sortedEntries = useCallback((cat: Category) => {
    const list = entries.filter(e => e.category === cat);
    if (sortBy === "amount") list.sort((a, b) => b.amount_cents - a.amount_cents);
    else list.sort((a, b) => b.spent_on.localeCompare(a.spent_on));
    return list;
  }, [entries, sortBy]);

  const exportCsv = () => {
    const rows = [
      ["date","category","subcategory","vendor","description","amount_usd","contractor","service","is_bonus","campaign","channel","billing_cycle","source","notes"],
      ...entries.map(e => [
        e.spent_on, e.category, e.subcategory ?? "", e.vendor ?? "", e.description,
        (e.amount_cents / 100).toFixed(2),
        e.contractor_name ?? "", e.service_type ?? "", String(e.is_bonus),
        e.campaign ?? "", e.channel ?? "", e.billing_cycle ?? "", e.source, e.notes ?? "",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tidy-costs-${month.start}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const openNew = () => { setEditing(null); setForm({ ...EMPTY_FORM, spent_on: new Date().toISOString().slice(0, 10) }); setShowForm(true); };
  const openEdit = (e: CostEntry) => { setEditing(e); setForm(e); setShowForm(true); };

  const submitForm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.description || !form.amount_cents || !form.spent_on || !form.category) return;
    const payload = {
      category: form.category as Category,
      subcategory: form.subcategory || null,
      vendor: form.vendor || null,
      description: form.description,
      amount_cents: Math.round(Number(form.amount_cents)),
      spent_on: form.spent_on,
      contractor_name: form.contractor_name || null,
      service_type: form.service_type || null,
      is_bonus: Boolean(form.is_bonus),
      campaign: form.campaign || null,
      channel: form.channel || null,
      billing_cycle: form.billing_cycle || null,
      notes: form.notes || null,
      source: editing?.source ?? "manual",
    };
    let res;
    if (editing) {
      res = await supabase.from("cost_entries").update(payload).eq("id", editing.id);
    } else {
      res = await supabase.from("cost_entries").insert(payload);
    }
    if (res.error) { alert(res.error.message); return; }
    setShowForm(false);
    void fetchAll();
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this cost entry?")) return;
    const { error } = await supabase.from("cost_entries").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    void fetchAll();
  };

  const syncJobber = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-jobber-payouts", {
        body: { start_date: month.start, end_date: month.end },
      });
      if (error) throw error;
      setSyncResult(`Synced ${data?.synced ?? 0} payouts (skipped ${data?.skipped ?? 0}, errors ${data?.error_count ?? 0}).`);
      void fetchAll();
    } catch (err) {
      setSyncResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  if (forbidden) {
    return <div className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center"><h1 className="text-xl font-semibold mb-2">Access denied</h1>
      <p className="text-slate-600">Admin role required.</p></div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Operations Costs</h1>
            <p className="text-sm text-slate-600">{month.label} — month-to-date</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={openNew} className="px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-800">+ Add cost</button>
            <button onClick={syncJobber} disabled={syncing} className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60">
              {syncing ? "Syncing..." : "Sync Jobber payouts"}
            </button>
            <button onClick={exportCsv} className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50">Export CSV</button>
          </div>
        </header>

        {syncResult && <div className="text-xs text-slate-700 bg-white border border-slate-200 rounded p-2">{syncResult}</div>}
        {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">{error}</div>}

        {/* At a glance */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total spend" value={fmtUSD(totals.total)} tone="bg-slate-900 text-white" />
          <Stat label="Gross revenue" value={fmtUSD(revenueCents)} tone="bg-white border border-slate-200" />
          <Stat label="Net margin" value={totals.margin == null ? "—" : `${totals.margin.toFixed(1)}%`} tone={totals.margin != null && totals.margin >= 30 ? "bg-emerald-50 border border-emerald-200 text-emerald-900" : "bg-amber-50 border border-amber-200 text-amber-900"} />
          <Stat label="Biggest category" value={totals.biggest ? `${CATEGORY_LABELS[totals.biggest[0]]} · ${fmtUSD(totals.biggest[1])}` : "—"} tone="bg-white border border-slate-200" />
        </section>

        {/* Category cards */}
        <section className="grid gap-3">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map(cat => {
            const list = sortedEntries(cat);
            const open = expanded === cat;
            return (
              <div key={cat} className={`rounded-lg border ${CATEGORY_TONES[cat]}`}>
                <button onClick={() => setExpanded(open ? null : cat)} className="w-full flex items-center justify-between p-4 text-left">
                  <div>
                    <div className="font-semibold">{CATEGORY_LABELS[cat]}</div>
                    <div className="text-xs opacity-80">{list.length} {list.length === 1 ? "entry" : "entries"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{fmtUSD(totals.byCat[cat])}</div>
                    <div className="text-xs opacity-70">{open ? "Hide ▲" : "Show ▼"}</div>
                  </div>
                </button>
                {open && (
                  <div className="border-t border-current/10 bg-white/60 backdrop-blur-sm">
                    <div className="flex justify-end gap-2 px-4 py-2 text-xs">
                      <span className="text-slate-500">Sort:</span>
                      <button onClick={() => setSortBy("date")} className={`underline-offset-2 ${sortBy === "date" ? "underline font-semibold" : ""}`}>Date</button>
                      <button onClick={() => setSortBy("amount")} className={`underline-offset-2 ${sortBy === "amount" ? "underline font-semibold" : ""}`}>Amount</button>
                    </div>
                    {loading ? <div className="p-4 text-sm text-slate-500">Loading…</div> :
                     list.length === 0 ? <div className="p-4 text-sm text-slate-500">No entries this month.</div> :
                     <div className="overflow-x-auto">
                       <table className="w-full text-sm">
                         <thead className="text-xs uppercase text-slate-500">
                           <tr><th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Description</th><th className="text-left px-4 py-2">Details</th><th className="text-right px-4 py-2">Amount</th><th className="px-4 py-2"></th></tr>
                         </thead>
                         <tbody className="divide-y divide-slate-200">
                           {list.map(e => (
                             <tr key={e.id} className="hover:bg-slate-50">
                               <td className="px-4 py-2 whitespace-nowrap text-slate-700">{e.spent_on}</td>
                               <td className="px-4 py-2">
                                 <div className="font-medium text-slate-900">{e.description}</div>
                                 {e.vendor && <div className="text-xs text-slate-500">{e.vendor}</div>}
                               </td>
                               <td className="px-4 py-2 text-xs text-slate-600">
                                 {cat === "contractor" && (
                                   <>
                                     {e.contractor_name && <div>👤 {e.contractor_name}</div>}
                                     {e.service_type && <div>🧰 {e.service_type}</div>}
                                     {e.is_bonus && <div className="text-emerald-700 font-semibold">★ Bonus</div>}
                                   </>
                                 )}
                                 {cat === "marketing" && (
                                   <>
                                     {e.channel && <div>📣 {e.channel}</div>}
                                     {e.campaign && <div>🎯 {e.campaign}</div>}
                                   </>
                                 )}
                                 {cat === "saas" && e.billing_cycle && <div>🔁 {e.billing_cycle}</div>}
                                 {e.notes && <div className="text-slate-400 italic">{e.notes}</div>}
                                 {e.source !== "manual" && <div className="text-[10px] uppercase text-slate-400">via {e.source}</div>}
                               </td>
                               <td className="px-4 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{fmtUSD(e.amount_cents)}</td>
                               <td className="px-4 py-2 text-right whitespace-nowrap">
                                 <button onClick={() => openEdit(e)} className="text-xs text-blue-700 hover:underline mr-2">Edit</button>
                                 <button onClick={() => deleteEntry(e.id)} className="text-xs text-rose-600 hover:underline">Delete</button>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {/* Add/edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowForm(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={submitForm} className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-3">
            <h2 className="text-lg font-semibold">{editing ? "Edit cost" : "Add cost"}</h2>
            <Field label="Category">
              <select required value={form.category} onChange={e => setForm({ ...form, category: e.target.value as Category })} className="w-full border rounded px-2 py-1.5">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </Field>
            <Field label="Description"><input required type="text" value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded px-2 py-1.5" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (USD)"><input required type="number" step="0.01" min="0" value={form.amount_cents ? form.amount_cents / 100 : ""} onChange={e => setForm({ ...form, amount_cents: Math.round(Number(e.target.value) * 100) })} className="w-full border rounded px-2 py-1.5" /></Field>
              <Field label="Date"><input required type="date" value={form.spent_on ?? ""} onChange={e => setForm({ ...form, spent_on: e.target.value })} className="w-full border rounded px-2 py-1.5" /></Field>
            </div>
            <Field label="Vendor (optional)"><input type="text" value={form.vendor ?? ""} onChange={e => setForm({ ...form, vendor: e.target.value })} className="w-full border rounded px-2 py-1.5" /></Field>

            {form.category === "contractor" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contractor name"><input type="text" value={form.contractor_name ?? ""} onChange={e => setForm({ ...form, contractor_name: e.target.value })} className="w-full border rounded px-2 py-1.5" /></Field>
                  <Field label="Service type"><input type="text" placeholder="cleaning / lawn / detailing" value={form.service_type ?? ""} onChange={e => setForm({ ...form, service_type: e.target.value })} className="w-full border rounded px-2 py-1.5" /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.is_bonus)} onChange={e => setForm({ ...form, is_bonus: e.target.checked })} /> This is a bonus payout</label>
              </>
            )}
            {form.category === "marketing" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Channel"><input type="text" placeholder="Meta Ads / Google" value={form.channel ?? ""} onChange={e => setForm({ ...form, channel: e.target.value })} className="w-full border rounded px-2 py-1.5" /></Field>
                <Field label="Campaign"><input type="text" value={form.campaign ?? ""} onChange={e => setForm({ ...form, campaign: e.target.value })} className="w-full border rounded px-2 py-1.5" /></Field>
              </div>
            )}
            {form.category === "saas" && (
              <Field label="Billing cycle"><select value={form.billing_cycle ?? ""} onChange={e => setForm({ ...form, billing_cycle: e.target.value })} className="w-full border rounded px-2 py-1.5"><option value="">—</option><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="one-time">One-time</option></select></Field>
            )}
            <Field label="Notes"><textarea rows={2} value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded px-2 py-1.5" /></Field>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm border rounded">Cancel</button>
              <button type="submit" className="px-3 py-1.5 text-sm rounded bg-slate-900 text-white">{editing ? "Save" : "Add"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className={`rounded-lg p-4 ${tone}`}><div className="text-xs uppercase tracking-wide opacity-80">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="block text-xs text-slate-600 mb-1">{label}</span>{children}</label>;
}
