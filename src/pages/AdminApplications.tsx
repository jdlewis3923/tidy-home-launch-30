import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export const STAGES = [
  { key: 'applied', label: 'Applied' }, { key: 'phone_screen', label: 'Phone screen' }, { key: 'equipment_check', label: 'Equipment check' },
  { key: 'hired', label: 'Hired' }, { key: 'rejected', label: 'Rejected' }, { key: 'profile_complete', label: 'Profile finished (existing Pros)' },
] as const;
type Row = { id: string; kind: string; service: string; stage: string; full_name: string | null; email: string | null; phone: string | null; src: string | null; is_test: boolean; submitted_at: string | null };
const SERVICE: Record<string, string> = { cleaning: 'House Cleaning', lawn: 'Lawn Care', car: 'Car Care' };
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

export default function AdminApplications() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<{ id: string; service: string; full_name: string | null; phone: string | null; updated_at: string }[]>([]);
  const [showTest, setShowTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { supabase.functions.invoke('pro-application', { body: { action: 'admin_list' } }).then(({ data, error }) => { if (error) setError(error.message); else { setRows(data.applications ?? []); setDrafts(data.drafts ?? []); } }); }, []);
  const visible = rows.filter((r) => r.is_test === showTest);
  return (
    <main className="admin-page">
      <Helmet><title>Applications · Tidy Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">Pro applications</h1><span className="text-sm text-muted-foreground">From jointidy.co/apply</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setShowTest(!showTest)}>{showTest ? 'Show real' : 'Show test'}</Button></div>
        {error && <p className="mt-4 text-destructive">{error}</p>}
        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          {STAGES.map((s) => { const list = visible.filter((r) => r.stage === s.key); return (
            <section key={s.key} className="rounded-xl border bg-card p-3">
              <h2 className="font-semibold">{s.label} <span className="text-muted-foreground">({list.length})</span></h2>
              <ul className="mt-2 space-y-2">{list.map((r) => <li key={r.id}><Link to={`/admin/applications/${r.id}`} className="block rounded-lg border p-2 hover:bg-muted"><div className="font-medium">{r.full_name ?? 'No name'}</div><div className="text-xs text-muted-foreground">{SERVICE[r.service]} · {when(r.submitted_at)}{r.src ? ` · ${r.src}` : ''}</div></Link></li>)}</ul>
            </section>); })}
        </div>
        {drafts.length > 0 && <section className="mt-8"><h2 className="font-semibold">Unfinished drafts ({drafts.length})</h2><p className="text-sm text-muted-foreground">Started but not submitted. They resume from the same link; nobody is chased.</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">{drafts.map((d) => <li key={d.id} className="rounded-lg border p-2 text-sm">{d.full_name ?? 'No name yet'} · {SERVICE[d.service]} · {when(d.updated_at)}</li>)}</ul></section>}
      </div>
    </main>
  );
}
