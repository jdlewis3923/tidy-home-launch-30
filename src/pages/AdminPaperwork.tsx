import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useHasRoleState } from '@/hooks/useHasRole';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type DocumentKey = 'agreement' | 'w9' | 'coi' | 'photo_id' | 'badge_photo';
type PaperworkDocument = {
  key: DocumentKey; label: string; status: string; document_id: number | null;
  uploaded_at: string | null; signed_at: string | null; signed_by: string | null;
  content_url: string | null; content_type: string | null; content_error: string | null;
  connecteam_url: string | null; tidy_reviewed_at: string | null; can_review: boolean;
};
type Pro = { connecteam_user_id: number; name: string; service: string; phone: string; application_id: string | null; documents: PaperworkDocument[] };
type ListResponse = { pros: Pro[]; connecteam_error: string | null; connecteam_approval_supported: false; connecteam_files_available: false };

const STATUS: Record<string, string> = {
  approved: 'Approved in Connecteam', pendingApproval: 'Waiting for approval', pendingUserUpload: 'Waiting for upload',
  pendingUserFilling: 'Waiting for Pro to fill or sign', pendingAdminFilling: 'Waiting for admin signature',
  pendingYourCompletion: 'Waiting for your signature', rejected: 'Rejected', completed: 'Completed', submitted: 'Submitted', not_assigned: 'Not assigned',
};
const SERVICE: Record<string, string> = { cleaning: 'House Cleaning', lawn: 'Lawn Care', detailing: 'Car Care', car: 'Car Care' };
const when = (value: string | null) => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) : null;

async function invoke(body: Record<string, unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      supabase.functions.invoke('admin-paperwork', { body }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Took longer than 10 seconds. Please retry.')), 10_000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export default function AdminPaperwork() {
  const { hasRole, isLoading } = useHasRoleState('admin');
  const [pros, setPros] = useState<Pro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [viewer, setViewer] = useState<{ url: string; title: string; type: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data, error: invokeError } = await invoke({ action: 'list' });
      if (invokeError) {
        const detail = invokeError instanceof FunctionsHttpError ? await invokeError.context.text() : invokeError.message;
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      setPros((data as ListResponse).pros ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (hasRole) void load(); }, [hasRole, load]);

  const approve = async (pro: Pro, doc: PaperworkDocument) => {
    const key = `${pro.connecteam_user_id}:${doc.key}`; setBusy(key);
    try {
      const { data, error: invokeError } = await invoke({ action: 'approve', connecteam_user_id: pro.connecteam_user_id, document_type: doc.key, document_id: doc.document_id, application_id: pro.application_id, submitted_at: doc.signed_at ?? doc.uploaded_at });
      if (invokeError) {
        const detail = invokeError instanceof FunctionsHttpError ? await invokeError.context.text() : invokeError.message;
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      const reviewedAt = data.review.approved_at as string;
      setPros((current) => current.map((item) => item.connecteam_user_id !== pro.connecteam_user_id ? item : { ...item, documents: item.documents.map((entry) => entry.key !== doc.key ? entry : { ...entry, tidy_reviewed_at: reviewedAt }) }));
      toast.success(`${doc.label} review recorded in Tidy`);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  };

  if (isLoading) return <main className="admin-page p-6">Loading…</main>;
  if (!hasRole) return <Navigate to="/login" replace />;

  return <main className="admin-page">
    <Helmet><title>Paperwork review · Tidy Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <header className="admin-page-header px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link to="/admin/command" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Command center</Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div><h1 className="text-2xl font-semibold sm:text-3xl">Paperwork review</h1><p className="mt-1 text-sm text-muted-foreground">Open each item, then record your review.</p></div>
          <Button variant="outline" size="icon" className="min-h-11 min-w-11 shrink-0" onClick={() => void load()} disabled={loading} aria-label="Refresh paperwork"><RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
      </div>
    </header>
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-medium">Connecteam approvals are separate.</p>
        <p className="mt-1 text-muted-foreground">Its API does not approve submitted documents or return their files. Open in Connecteam to view and approve there; “Record approval” tracks your review in Tidy.</p>
      </div>
      {error && <div role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4"><p className="font-medium">Couldn’t load paperwork</p><p className="mt-1 break-words text-sm text-muted-foreground">{error}</p><Button className="mt-3 min-h-11" variant="outline" onClick={() => void load()}>Retry</Button></div>}
      {!loading && !error && pros.length === 0 && <p className="mt-6 rounded-lg border bg-card p-6 text-center">No Pro paperwork is waiting.</p>}
      <div className="mt-5 space-y-6">
        {pros.map((pro) => <section key={pro.connecteam_user_id} className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby={`pro-${pro.connecteam_user_id}`}>
          <div className="min-w-0 border-b pb-4">
            <h2 id={`pro-${pro.connecteam_user_id}`} className="break-words text-xl font-semibold">{pro.name}</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">{SERVICE[pro.service] ?? pro.service}{pro.phone && <> · <a className="underline" href={`tel:${pro.phone}`}>{pro.phone}</a></>}</p>
          </div>
          <div className="divide-y">
            {pro.documents.map((doc) => {
              const key = `${pro.connecteam_user_id}:${doc.key}`;
              const submitted = when(doc.signed_at ?? doc.uploaded_at);
              return <article key={doc.key} className="min-w-0 py-5">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><h3 className="break-words text-base font-semibold">{doc.label}</h3><p className="mt-1 text-sm text-muted-foreground">{STATUS[doc.status] ?? doc.status}</p></div>
                  {doc.tidy_reviewed_at && <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><Check className="h-3.5 w-3.5" /> Reviewed in Tidy</span>}
                </div>
                {doc.signed_by && doc.signed_at && <p className="mt-2 text-sm">Signed by <strong>{doc.signed_by}</strong> · {when(doc.signed_at)} ET</p>}
                {!doc.signed_by && submitted && <p className="mt-2 text-sm">Submitted by {pro.name} · {submitted} ET</p>}
                {doc.content_url && doc.content_type === 'image' && <button type="button" className="mt-3 block w-full overflow-hidden rounded-lg border bg-muted" onClick={() => setViewer({ url: doc.content_url!, title: `${pro.name} — ${doc.label}`, type: doc.content_type })} aria-label={`View ${doc.label} full screen`}><img src={doc.content_url} alt={`${pro.name} ${doc.label}`} className="max-h-96 w-full object-contain" loading="lazy" /></button>}
                {doc.content_url && doc.content_type === 'application/pdf' && <div className="mt-3"><iframe src={doc.content_url} title={`${pro.name} signed agreement`} className="h-96 w-full rounded-lg border bg-background" /><Button asChild variant="outline" className="mt-2 min-h-11 w-full"><a href={doc.content_url} target="_blank" rel="noreferrer"><FileText className="mr-2 h-4 w-4" /> Open signed PDF</a></Button></div>}
                {doc.content_error && <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><p className="font-medium">Couldn’t load — open in Connecteam</p><p className="mt-1 break-words text-muted-foreground">{doc.content_error.replace(/^Couldn't load — open in Connecteam\.\s*/, '')}</p></div>}
                <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                  {doc.connecteam_url && <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto"><a href={doc.connecteam_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Open in Connecteam</a></Button>}
                  <Button className="min-h-11 w-full sm:w-auto" disabled={!doc.can_review || busy === key || !!doc.tidy_reviewed_at} onClick={() => void approve(pro, doc)}>{busy === key ? 'Saving…' : doc.tidy_reviewed_at ? 'Reviewed' : doc.connecteam_url ? 'Record approval' : 'Approve'}</Button>
                </div>
                {doc.tidy_reviewed_at && <p className="mt-2 text-xs text-muted-foreground">Tidy review saved {when(doc.tidy_reviewed_at)} ET</p>}
              </article>;
            })}
          </div>
        </section>)}
      </div>
    </div>
    <Dialog open={!!viewer} onOpenChange={(open) => !open && setViewer(null)}>
      <DialogContent className="h-dvh w-screen max-w-none rounded-none border-0 bg-background p-3 sm:h-[95vh] sm:w-[95vw] sm:max-w-5xl">
        <DialogTitle className="pr-10 text-sm">{viewer?.title}</DialogTitle>
        {viewer?.type === 'image' && <img src={viewer.url} alt={viewer.title} className="max-h-[calc(100dvh-6rem)] min-h-0 w-full object-contain" />}
      </DialogContent>
    </Dialog>
  </main>;
}
