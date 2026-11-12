import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Camera, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import TidyLogo from '@/components/TidyLogo';
import SeoHead from '@/components/landing/SeoHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { askedFields, fieldError, SECTION_LABEL, SECTION_ORDER, SERVICE_LABEL, serviceFrom, type Field, type Service } from '@/lib/proApplication';

type Draft = { token: string; kind: 'apply' | 'finish_profile'; service: Service; stage: string; lang: 'en' | 'es'; answers: Record<string, unknown>; prefill: Record<string, unknown>; skip: string[]; files: Record<string, { name: string }> };
const call = async (body: Record<string, unknown>) => { const { data, error } = await supabase.functions.invoke('pro-application', { body }); if (error) { const ctx = await (error as { context?: Response }).context?.json?.().catch(() => null); throw Object.assign(new Error(ctx?.error ?? error.message), { detail: ctx }); } return data; };
const ERR: Record<string, [string, string]> = { required: ['Required', 'Obligatorio'], email: ['Enter a valid email', 'Correo no válido'], phone: ['Enter a 10-digit number', 'Número de 10 dígitos'], zip: ['5-digit ZIP', 'Código de 5 dígitos'], badge: ['First name + last initial, e.g. Maria G.', 'Nombre + inicial, ej. Maria G.'], number: ['Enter a number', 'Escribe un número'], age: ['You must be 18 or older', 'Debes tener 18 años o más'], long: ['Too long', 'Muy largo'] };

export default function ApplyForm({ finish = false }: { finish?: boolean }) {
  const { service: raw } = useParams();
  const [params, setParams] = useSearchParams();
  const routeService = serviceFrom(raw);
  const storeKey = `tidy-apply-${routeService}`;
  const token = params.get('t') ?? (finish ? null : localStorage.getItem(storeKey));
  const [lang, setLang] = useState<'en' | 'es'>(() => (navigator.language.startsWith('es') ? 'es' : 'en'));
  const t = (en: string, es: string) => (lang === 'es' ? es : en);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(!!token);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [uploading, setUploading] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const timer = useRef<number>();
  const pending = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (!token || draft?.token === token) return;
    call({ action: 'load', token }).then((d: Draft) => { setDraft(d); setAnswers(d.answers ?? {}); setLang(d.lang); if (d.stage !== 'draft') setDone(true); if (!params.get('t')) setParams((p) => { p.set('t', d.token); return p; }, { replace: true }); })
      .catch(() => { localStorage.removeItem(storeKey); if (finish) setProblem(t('This link is not valid. Call (786) 829-1141.', 'Este enlace no es válido. Llama al (786) 829-1141.')); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const service = draft?.service ?? routeService;
  const starting = useRef<Promise<Draft> | null>(null);
  const ensureDraft = async (): Promise<Draft> => {
    if (draft) return draft;
    // One draft per person: concurrent saves/uploads share the same start call.
    starting.current ??= call({ action: 'start', service, src: params.get('src'), lang }).then((d: Draft) => {
      setDraft(d); localStorage.setItem(storeKey, d.token); setParams((p) => { p.set('t', d.token); return p; }, { replace: true });
      return d;
    }).catch((e) => { starting.current = null; throw e; });
    return starting.current;
  };
  const flush = async () => { const d = await ensureDraft(); const body = pending.current; pending.current = {}; if (!Object.keys(body).length) return; setSaving('saving'); await call({ action: 'save', token: d.token, answers: body, lang }); setSaving('saved'); };
  const set = (k: string, v: unknown) => { setAnswers((a) => ({ ...a, [k]: v })); pending.current[k] = v; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => flush().catch(() => setSaving('idle')), 700); };

  const sections = useMemo(() => {
    if (!service) return [];
    const fields = askedFields(service, answers, draft?.prefill ?? {}, draft?.skip ?? []);
    return SECTION_ORDER.map((s) => ({ s, fields: fields.filter((f) => f.section === s) })).filter((x) => x.fields.length);
  }, [service, answers, draft]);

  if (!service && !finish) return <Navigate to={`/apply${window.location.search}`} replace />;
  if (!service) return <div className="min-h-screen bg-navy text-primary-foreground">{loading ? <Loader2 className="mx-auto pt-20 h-8 w-8 animate-spin" /> : <p className="pt-20 text-center">{problem ?? t('This link is not valid. Call (786) 829-1141.', 'Este enlace no es válido. Llama al (786) 829-1141.')}</p>}</div>;
  const files = draft?.files ?? {};
  const value = (f: Field) => (f.type === 'file' ? files[f.key] : answers[f.key]);
  const current = sections[Math.min(step, sections.length - 1)];
  const stepErrors = current ? current.fields.filter((f) => fieldError(f, value(f))) : [];

  const upload = async (f: Field, file: File) => {
    setUploading(f.key);
    try {
      const d = await ensureDraft();
      const u = await call({ action: 'upload_url', token: d.token, key: f.key, content_type: file.type });
      const { error } = await supabase.storage.from('pro-applications').uploadToSignedUrl(u.path, u.token, file, { contentType: file.type });
      if (error) throw error;
      await call({ action: 'attach', token: d.token, key: f.key, path: u.path, answers: { name: file.name } });
      setDraft((x) => ({ ...(x ?? d), files: { ...(x ?? d).files, [f.key]: { name: file.name } } }));
    } catch { setProblem(t('Upload failed. Try again.', 'Falló la carga. Intenta de nuevo.')); }
    setUploading(null);
  };

  const next = async () => {
    if (stepErrors.length) { setShowErrors(true); return; }
    setShowErrors(false); setProblem(null);
    if (step < sections.length - 1) { await flush().catch(() => null); setStep(step + 1); window.scrollTo(0, 0); return; }
    try { await flush(); const d = await ensureDraft(); await call({ action: 'submit', token: d.token, answers, lang }); localStorage.removeItem(storeKey); setDone(true); window.scrollTo(0, 0); }
    catch (e) { const missing = (e as { detail?: { missing?: string[] } }).detail?.missing; setProblem(missing ? t('Please finish the highlighted questions.', 'Completa las preguntas marcadas.') : t('Something went wrong. Your answers are saved — try again.', 'Algo salió mal. Tus respuestas están guardadas — intenta de nuevo.')); if (missing) { const i = sections.findIndex((x) => x.fields.some((f) => missing.includes(f.key))); if (i >= 0) { setStep(i); setShowErrors(true); } } }
  };

  const label = SERVICE_LABEL[service];
  const first = String(answers.first_name ?? draft?.prefill?.first_name ?? '');
  return (
    <div className="min-h-screen bg-navy text-primary-foreground">
      <SeoHead title={`Apply: ${label.en} | Tidy`} description="Apply to be a Tidy Pro in Pinecrest & Kendall. Paid every Friday." canonical={`https://jointidy.co/apply/${service}`} />
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 py-4">
        <Link to={`/apply${params.get('src') ? `?src=${encodeURIComponent(params.get('src')!)}` : ''}`} aria-label="Tidy"><TidyLogo size="sm" /></Link>
        <Button variant="ghost" type="button" onClick={() => setLang(lang === 'en' ? 'es' : 'en')} className="rounded-full border border-primary-foreground/40 px-4 py-1.5 text-sm">{lang === 'en' ? 'Español' : 'English'}</Button>
      </header>
      <main className="mx-auto max-w-xl px-5 pb-24">
        {loading ? <Loader2 className="mx-auto mt-20 h-8 w-8 animate-spin" /> : done ? (
          <section className="mt-10 rounded-2xl bg-navy-deep p-8 text-center">
            <Check className="mx-auto h-12 w-12 text-gold" aria-hidden />
            <h1 className="mt-4 text-2xl font-bold">{draft?.kind === 'finish_profile' ? t('Your profile is complete', 'Tu perfil está completo') : t('Application received', 'Solicitud recibida')}</h1>
            <p className="mt-3 text-primary-foreground/80">{draft?.kind === 'finish_profile' ? t("Thank you. We'll order your kit. Finish any open documents in the Tidy app.", 'Gracias. Pediremos tu kit. Termina tus documentos pendientes en la app de Tidy.') : t("Thank you. We'll call you within 2 business days.", 'Gracias. Te llamaremos en 2 días hábiles.')}</p>
          </section>
        ) : problem && finish && !draft ? <p className="mt-16 text-center">{problem}</p> : (
          <>
            <p className="text-sm uppercase tracking-wide text-gold">{t(label.en, label.es)}</p>
            <h1 className="mt-1 text-2xl font-bold">{draft?.kind === 'finish_profile' ? t(`Finish your Tidy profile${first ? `, ${first}` : ''}`, `Termina tu perfil de Tidy${first ? `, ${first}` : ''}`) : t('Apply in one pass', 'Aplica en un solo paso')}</h1>
            <div className="mt-4 flex gap-1" aria-hidden>{sections.map((x, i) => <span key={x.s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-gold' : 'bg-primary-foreground/20'}`} />)}</div>
            <p className="mt-2 text-xs text-primary-foreground/60">{t(`Step ${step + 1} of ${sections.length}`, `Paso ${step + 1} de ${sections.length}`)} · {saving === 'saving' ? t('Saving…', 'Guardando…') : saving === 'saved' ? t('Saved — you can come back to this link', 'Guardado — puedes volver a este enlace') : ''}</p>
            {current && <section className="mt-6 space-y-5">
              <h2 className="text-xl font-semibold">{t(SECTION_LABEL[current.s].en, SECTION_LABEL[current.s].es)}</h2>
              {current.fields.map((f) => { const err = showErrors ? fieldError(f, value(f)) : null; return (
                <div key={f.key}>
                  <label className="mb-1.5 block font-medium" htmlFor={f.key}>{t(f.en, f.es)}</label>
                  {f.hint && <p className="mb-1.5 text-sm text-primary-foreground/60">{t(f.hint.en, f.hint.es)}</p>}
                  <FieldInput f={f} v={value(f)} lang={lang} onChange={(v) => set(f.key, v)} onFile={(file) => upload(f, file)} busy={uploading === f.key} />
                  {err && <p className="mt-1 text-sm text-destructive" role="alert">{t(...ERR[err])}</p>}
                </div>); })}
            </section>}
            {problem && <p className="mt-5 text-sm text-destructive" role="alert">{problem}</p>}
            <div className="mt-8 flex gap-3">
              {step > 0 && <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} className="min-h-[52px] rounded-full border border-primary-foreground/30 px-5"><ArrowLeft className="h-5 w-5" /> {t('Back', 'Atrás')}</Button>}
              <Button type="button" onClick={next} disabled={!!uploading} className="min-h-[52px] flex-1 rounded-full bg-gold text-base font-semibold text-gold-foreground hover:bg-gold hover:brightness-105">
                {step < sections.length - 1 ? <>{t('Continue', 'Continuar')} <ArrowRight className="h-5 w-5" /></> : draft?.kind === 'finish_profile' ? t('Finish my profile', 'Terminar mi perfil') : t('Submit application', 'Enviar solicitud')}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function FieldInput({ f, v, lang, onChange, onFile, busy }: { f: Field; v: unknown; lang: 'en' | 'es'; onChange: (v: unknown) => void; onFile: (f: File) => void; busy: boolean }) {
  const t = (en: string, es: string) => (lang === 'es' ? es : en);
  const chip = (on: boolean) => `min-h-[48px] rounded-xl border px-4 text-base font-medium ${on ? 'border-gold bg-gold text-gold-foreground' : 'border-primary-foreground/25 bg-navy-deep text-primary-foreground'}`;
  if (f.type === 'yesno') return <div className="grid grid-cols-2 gap-3">{[['yes', t('Yes', 'Sí')], ['no', 'No']].map(([k, l]) => <button key={k} type="button" aria-pressed={v === k} className={chip(v === k)} onClick={() => onChange(k)}>{l}</button>)}</div>;
  if (f.type === 'multi' || f.type === 'select') { const arr = Array.isArray(v) ? (v as string[]) : []; return <div className="flex flex-wrap gap-2">{f.options!.map((o) => { const on = f.type === 'multi' ? arr.includes(o.v) : v === o.v; return <button key={o.v} type="button" aria-pressed={on} className={chip(on)} onClick={() => onChange(f.type === 'multi' ? (on ? arr.filter((x) => x !== o.v) : [...arr, o.v]) : o.v)}>{t(o.en, o.es)}</button>; })}</div>; }
  if (f.type === 'file') { const file = v as { name: string } | undefined; return (
    <label className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 ${file ? 'border-gold' : 'border-primary-foreground/30'} bg-navy-deep`}>
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : file ? <Check className="h-5 w-5 text-gold" /> : <Camera className="h-5 w-5" />}
      <span className="truncate">{busy ? t('Uploading…', 'Subiendo…') : file ? `${file.name} · ${t('tap to replace', 'toca para cambiar')}` : t('Take or choose a photo', 'Toma o elige una foto')}</span>
      <input id={f.key} type="file" className="sr-only" accept={f.key === 'resume' ? '.pdf,.doc,.docx,image/*' : 'image/*'} onChange={(e) => { const x = e.target.files?.[0]; if (x) onFile(x); e.target.value = ''; }} />
    </label>); }
  return <Input id={f.key} type={f.type === 'tel' ? 'tel' : f.type} inputMode={f.type === 'tel' || f.type === 'number' || /zip/.test(f.key) ? 'numeric' : undefined} autoComplete={({ first_name: 'given-name', last_name: 'family-name', phone: 'tel', email: 'email', street: 'street-address', city: 'address-level2', zip: 'postal-code', dob: 'bday' } as Record<string, string>)[f.key]} value={String(v ?? '')} onChange={(e) => onChange(e.target.value)} className="min-h-[52px] border-primary-foreground/25 bg-navy-deep text-base text-primary-foreground" />;
}
