import {describe,it,expect} from 'vitest';
import {redoPayCents} from '@/lib/redo-pay';
import {onboardingPack} from '../../supabase/functions/_shared/onboarding-pack';
import {isWindowOpen,nextOpenWindow} from '../../supabase/functions/_shared/sms-window';
import fs from 'node:fs';
describe('Redo member rolling guardrail',()=>{
 it('frontend and sender math stay identical',()=>expect(fs.readFileSync('src/lib/redo-pay.ts','utf8')).toBe(fs.readFileSync('supabase/functions/_shared/redo-pay.ts','utf8')));
 it('first redo pays 50% of original $76 rate',()=>expect(redoPayCents(7600,null,new Date('2026-10-29T16:00Z'))).toBe(3800));
 it('second redo within 60 days is unpaid',()=>expect(redoPayCents(7600,new Date('2026-10-29T16:00Z'),new Date('2026-11-29T16:00Z'))).toBe(0));
 it('60 days after last paid redo pays 50% again',()=>expect(redoPayCents(7600,new Date('2026-10-29T16:00Z'),new Date('2026-12-28T16:00Z'))).toBe(3800));
});
describe('Onboarding availability and quiet hours',()=>{
 const links={intake:'intake',agreement:null,app:null,insurance:'insurance',background:'checkr'};
 it('never includes app login before signing',()=>expect(onboardingPack(links,false).includes('Pro app login')).toBe(false));
 it('includes approved agreement and signed app in order',()=>{const t=onboardingPack({...links,agreement:'contract',app:'login'},false);expect(t.indexOf('contract')).toBeLessThan(t.indexOf('login'));});
 it('closes at 6 PM Eastern',()=>expect(isWindowOpen(new Date('2026-10-29T22:00:00Z'))).toBe(false));
 it('opens at 8 AM Eastern',()=>expect(isWindowOpen(new Date('2026-10-29T12:00:00Z'))).toBe(true));
 it('Sunday queues to Monday at 8 AM exactly',()=>expect(nextOpenWindow(new Date('2026-11-01T15:43:00Z')).toISOString()).toBe('2026-11-02T13:00:00.000Z'));
});