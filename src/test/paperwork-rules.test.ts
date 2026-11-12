import {describe,it,expect} from 'vitest';
import {POSITIONS,paperworkState,paperworkDigest} from '../../supabase/functions/_shared/paperwork-rules';
const ids={w9:1,coi:2,agreement:3,intake:4};
const rows=[{documentId:4,status:'approved',signedAt:1793900000},{documentId:1,status:'approved'},{documentId:2,status:'approved',expiresAt:1900000000},{documentId:3,status:'approved',signedAt:1793900000}];
describe('Connecteam paperwork',()=>{
 it('uses the three exact service Positions',()=>{expect(POSITIONS).toEqual({cleaning:'House Cleaning Pro',lawn:'Lawn Care Pro',detailing:'Car Care Pro'});});
 it('unblocks only all three completed approved documents with an actual signature',()=>{expect(paperworkState(rows,ids,1793900000000).complete).toBe(true);expect(paperworkState(rows.slice(1),ids,1793900000000).complete).toBe(false);});
 it('does not infer a signature from approval',()=>{expect(paperworkState(rows.map(r=>({...r,signedAt:undefined})),ids,1793900000000).complete).toBe(false);});
 it('expired COI blocks readiness',()=>{expect(paperworkState(rows,ids,1900000000001).complete).toBe(false);});
 it('pending review never unblocks pay',()=>{expect(paperworkState(rows.map(r=>r.documentId===2?{...r,status:'pendingApproval'}:r),ids,1793900000000).complete).toBe(false);});
 it('both digests exclude test Pros and name waiting real Pros',()=>{expect(paperworkDigest([{name:'Susan Horn',paperwork_complete:false},{name:'Jenifer Whitney',paperwork_complete:false},{name:'Test',paperwork_complete:true,is_test:true}])).toBe('Paperwork: 0 Pros complete, 2 waiting (Susan Horn, Jenifer Whitney)');});
});
import { paperworkState as ps2 } from '../../supabase/functions/_shared/paperwork-rules';
describe('site signature counts as agreement', () => {
  const ids = { w9: 1, coi: 2, agreement: 3, intake: 4 };
  it('marks agreement signed but still needs W-9 and COI', () => {
    const s = ps2([{ documentId: 3, status: 'pendingUserFilling' }], ids, Date.now(), '2026-11-05T22:53:35Z');
    expect(s.status.agreement).toBe('completed');
    expect(s.signedAt).toBe('2026-11-05T22:53:35.000Z');
    expect(s.complete).toBe(false);
  });
  it('is complete once W-9 and COI are approved', () => {
    const s = ps2([{ documentId: 4, status: 'approved',signedAt:1793900000 }, { documentId: 1, status: 'approved' }, { documentId: 2, status: 'approved' }], ids, Date.now(), '2026-11-05T22:53:35Z');
    expect(s.complete).toBe(true);
  });
});

it('requires a signed intake even with a site-signed agreement',()=>{const site='2026-11-05T22:53:35Z';const base=[{documentId:1,status:'approved'},{documentId:2,status:'approved'}];expect(paperworkState(base,ids,1793900000000,site).complete).toBe(false);expect(paperworkState([...base,{documentId:4,status:'approved'}],ids,1793900000000,site).complete).toBe(false);expect(paperworkState([...base,{documentId:4,status:'approved',signedAt:1793900000}],ids,1793900000000,site).complete).toBe(true);});

describe('photo ID + badge photo requirement', () => {
  const ids = { w9: 1, coi: 2, agreement: 3, intake: 4, photo_id: 5 };
  const done = (id: number) => ({ documentId: id, status: 'approved', signedAt: 1 });
  it('is incomplete until the photo ID is approved', () => {
    expect(paperworkState([done(1), done(2), done(3), done(4)], ids).complete).toBe(false);
    expect(paperworkState([done(1), done(2), done(3), done(4), done(5)], ids).complete).toBe(true);
  });
});
