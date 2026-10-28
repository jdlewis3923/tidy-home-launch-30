import { validV6Answer, type V6Question } from '../../supabase/functions/_shared/application-v6';

export function remainingRequiredQuestions<T extends V6Question>(questions: T[], answers: Record<string, unknown>, version: number): T[] {
  return questions.filter(q => {
    if (!q.required) return false;
    const value = answers[q.id];
    if (version === 6) return !validV6Answer(q, value);
    if (q.type === 'slider') return false;
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  });
}

export function resumeJobs(value: unknown): Record<string, string>[] {
  if (!Array.isArray(value)) return [{ title: '', company: '', duration: '' }];
  const jobs = value.filter(job => job && typeof job === 'object' && Object.values(job).some(v => typeof v === 'string' && v.trim()));
  return jobs.length ? jobs : [{ title: '', company: '', duration: '' }];
}