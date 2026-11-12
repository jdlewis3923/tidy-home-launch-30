import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { fieldsFor, SECTION_LABEL, SECTION_ORDER, SERVICE_LABEL, type Service } from '@/lib/proApplication';
import { STAGES } from './AdminApplications';

type App = { id: string; kind: string; service: Service; stage: string; answers: Record<string, unknown>; prefill: Record<string, unknown>; full_name: string | null; src: string | null; submitted_at: string | null; connecteam_user_id: number | null; is_test: boolean };
const show = (v: unknown, opts?: { v: string; en: string }[]) => Array.isArray(v) ? v.map((x) => opts?.find((o) => o.v === x)?.en ?? x).join(', ') : opts?.find((o) => o.v === v)?.en ?? (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : String(v ?? '—'));

export default function AdminApplication() {
  const { id } = useParams();
  const [app, setApp] = useState<App | null>(null);
  const [files, setFiles] = useState<Record<string, { url: string; name: string }>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const { data, error } = await supabase.functions.invoke('pro-application', { body: { action: 'admin_get', id } }); if (error) toast({ title: 'Could not load', description: error.message }); else { setApp(data.application); setFiles(data.files ?? {}); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: Record<string, unknown>, ok: string) => { setBusy(true); const { data, error } = await supabase.functions.invoke('pro-application', { body: { id, ...body } }); setBusy(false); if (error || data?.error) toast({ title: 'Failed', description: data?.error ?? error?.message }); else { toast({ title: ok }); void load(); } };
  if (!app) return <main className="admin-page p-6">Loading…</main>;
  const a = { ...app.prefill, ...app.answers };
  const fields = fieldsFor(app.service);
  const locked = ['hired', 'profile_complete'].includes(app.stage);
  return (
    <main className="admin-page">
      <Helmet><title>{app.full_name ?? 'Application'} · Tidy Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Link to="/admin/applications" className="text-sm text-muted-foreground">← Applications</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{app.full_name ?? 'No name'}</h1>
          <span className="rounded-full bg-muted px-3 py-1 text-sm">{SERVICE_LABEL[app.service].en}</span>
          <span className="rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground">{STAGES.find((s) => s.key === app.stage)?.label ?? app.stage}</span>
          {app.is_test && <span className="rounded-full bg-muted px-3 py-1 text-sm">Test</span>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{a.phone as string} · {a.email as string}{app.src ? ` · src ${app.src}` : ''}{app.connecteam_user_id ? ` · Connecteam ${app.connecteam_user_id}` : ''}</p>
        {!locked && app.kind === 'apply' && <div className="mt-4 flex flex-wrap gap-2">
          {(['phone_screen', 'equipment_check'] as const).map((s) => <Button key={s} variant="outline" disabled={busy || app.stage === s} onClick={() => act({ action: 'admin_stage', stage: s }, 'Moved')}>{STAGES.find((x) => x.key === s)!.label}</Button>)}
          <Button disabled={busy || app.stage === 'rejected'} onClick={() => { if (confirm(`Hire ${app.full_name}? This creates their Connecteam user and sends the paperwork email.`)) void act({ action: 'admin_hire' }, 'Hired — Connecteam user created'); }}>Hire</Button>
          <Button variant="destructive" disabled={busy || app.stage === 'rejected'} onClick={() => act({ action: 'admin_stage', stage: 'rejected' }, 'Rejected')}>Reject</Button>
        </div>}
        {SECTION_ORDER.map((s) => { const fs = fields.filter((f) => f.section === s); return (
          <section key={s} className="mt-6 rounded-xl border bg-card p-4">
            <h2 className="font-semibold">{SECTION_LABEL[s].en}</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">{fs.map((f) => f.type === 'file' ? (
              <div key={f.key}><dt className="text-sm text-muted-foreground">{f.en}</dt><dd>{files[f.key] ? /\.(pdf|docx?)$/i.test(files[f.key].name) ? <a className="underline" href={files[f.key].url} target="_blank" rel="noreferrer">{files[f.key].name}</a> : <a href={files[f.key].url} target="_blank" rel="noreferrer"><img src={files[f.key].url} alt={f.en} className="mt-1 h-40 w-full rounded-lg object-cover" /></a> : '—'}</dd></div>
            ) : (
              <div key={f.key}><dt className="text-sm text-muted-foreground">{f.en}</dt><dd className="font-medium">{show(a[f.key], f.options)}</dd></div>
            ))}</dl>
          </section>); })}
      </div>
    </main>
  );
}
