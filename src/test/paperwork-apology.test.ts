import {describe,it,expect} from 'vitest';
import {paperworkSteps,PAPERWORK_IDS} from '../../supabase/functions/_shared/paperwork-email';
describe('required intake reminder selection',()=>{
 it('keeps only W-9 and COI outstanding for Susan without asking for her signed agreement',()=>{
  const remaining=paperworkSteps('cleaning',{agreement:'completed'},true,false).filter(s=>!s.done);
  expect(remaining.map(s=>s.key)).toEqual(['w9','coi']);
 });
});