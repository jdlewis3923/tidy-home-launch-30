import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
export default function IndeedResume({ applicantId }: { applicantId: string }) {
  const { language } = useLanguage();
  const t = (en: string, es: string) => language === 'es' ? es : en;
  const [text, setText] = useState(''), [draft, setDraft] = useState(''), [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true); setEditing(false); setError(''); setText(''); setNotes('');
    void Promise.all([
      supabase.from('candidate_indeed_resumes').select('resume_text').eq('applicant_id', applicantId).maybeSingle(),
      supabase.from('applicants').select('notes,notes_for_admin,why,watch_for').eq('id', applicantId).maybeSingle(),
    ]).then(([resume, applicant]) => {
      if (!alive) return;
      setError(resume.error?.message ?? applicant.error?.message ?? '');
      setText(resume.data?.resume_text ?? ''); setDraft(resume.data?.resume_text ?? '');
      setNotes([applicant.data?.notes, applicant.data?.notes_for_admin, applicant.data?.why, applicant.data?.watch_for].filter(Boolean).join('\n\n'));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [applicantId]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('candidate_indeed_resumes').upsert({ applicant_id: applicantId, resume_text: draft, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setText(draft); setEditing(false); toast.success(t('Indeed résumé saved', 'Currículum de Indeed guardado'));
  };
  return <section aria-label={t('Indeed résumé', 'Currículum de Indeed')} className="space-y-3 border-y border-border py-4 text-foreground">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold">{t('Indeed résumé — original text', 'Currículum de Indeed — texto original')}</h2><Button size="sm" variant="outline" onClick={() => { setDraft(text); setEditing(!editing); }}>{editing ? t('Cancel', 'Cancelar') : t('Add / update résumé', 'Agregar / actualizar currículum')}</Button></div>
    {loading ? <p className="text-sm text-muted-foreground">{t('Loading…', 'Cargando…')}</p> : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : text ? <div className="whitespace-pre-wrap break-words text-sm">{text}</div> : <p className="text-sm text-muted-foreground">{t('The original Indeed résumé has not been supplied. Imported notes below are not a full résumé.', 'No se ha proporcionado el currículum original de Indeed. Las notas importadas abajo no son el currículum completo.')}</p>}
    {editing && <div className="space-y-2"><Textarea aria-label={t('Original Indeed résumé text', 'Texto original del currículum de Indeed')} value={draft} onChange={e => setDraft(e.target.value)} rows={12}/><Button size="sm" disabled={saving || !draft.trim()} onClick={save}>{t('Save résumé', 'Guardar currículum')}</Button></div>}
    {notes && <div className="space-y-2"><h3 className="text-sm font-semibold">{t('Imported candidate notes (not the résumé)', 'Notas importadas (no son el currículum)')}</h3><p className="whitespace-pre-wrap break-words text-sm">{notes}</p></div>}
  </section>;
}
