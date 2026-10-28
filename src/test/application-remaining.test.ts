import { describe, expect, it } from 'vitest';
import { remainingRequiredQuestions, resumeJobs } from '../lib/application-remaining';

const q = (key: string, type = 'text', required = true) => ({ id: key, key, type, required, service: 'all', label_en: key, label_es: key });
describe('Owner-configured remaining-only application', () => {
  it('does not repeat completed questions or request optional answers', () => {
    const questions = [q('v6.about.first_name'), q('v6.about.email'), q('v6.anything', 'text', false)];
    const answers = { 'v6.about.first_name': 'Rebecca' };
    expect(remainingRequiredQuestions(questions, answers, 6).map(q => q.key)).toEqual(['v6.about.email']);
    expect(questions).toHaveLength(3);
    expect(answers).toEqual({ 'v6.about.first_name': 'Rebecca' });
  });
  it('keeps unfinished job details required', () => {
    expect(remainingRequiredQuestions([q('v6.work.jobs', 'grid')], { 'v6.work.jobs': [{ title: 'Construction worker.', duration: '1', company: '' }] }, 6)).toHaveLength(1);
  });
  it('preserves valid zero skill scores and explicitly missing equipment', () => {
    expect(remainingRequiredQuestions([q('v6.skill.cleaning.kitchen', 'slider'), q('v6.equipment.cleaning', 'multi')], { 'v6.skill.cleaning.kitchen': 0, 'v6.equipment.cleaning': [] }, 6)).toEqual([]);
  });
  it('ignores a wholly empty optional second job without discarding partial history', () => {
    expect(resumeJobs([{ title: 'Construction worker.', company: '', duration: '1' }, { title: '', company: '', duration: '' }])).toEqual([{ title: 'Construction worker.', company: '', duration: '1' }]);
  });
  it('requires affirmative consent and valid contact details', () => {
    expect(remainingRequiredQuestions([q('v6.sms'), q('v6.about.phone')], { 'v6.sms': false, 'v6.about.phone': '123' }, 6)).toHaveLength(2);
  });
});