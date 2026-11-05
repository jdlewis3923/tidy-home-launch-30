import {describe,it,expect} from 'vitest';
import {POSITIONS,paperworkState,paperworkDigest} from '../../supabase/functions/_shared/paperwork-rules';
const ids={w9:1,coi:2,agreement:3};
const rows=[{documentId:1,status:'approved'},{documentId:2,status:'approved',expiresAt:1900000000},{documentId:3,status:'approved',signedAt:1793900000}];
describe('Connecteam paperwork',()=>{
 it('uses the three exact service Positions',()=>{expect(POSITIONS).toEqual({cleaning:'House Cleaning Pro',lawn:'Lawn Care Pro',detailing:'Car Care Pro'});});
 it('unblocks only all three completed approved documents with an actual signature',()=>{expect(paperworkState(rows,ids,1793900000000).complete).toBe(true);expect(paperworkState(rows.slice(1),ids,1793900000000).complete).toBe(false);});
 it('does not infer a signature from approval',()=>{expect(paperworkState(rows.map(r=>({...r,signedAt:undefined})),ids,1793900000000).complete).toBe(false);});
 it('expired COI blocks readiness',()=>{expect(paperworkState(rows,ids,1900000000001).complete).toBe(false);});
 it('pending review never unblocks pay',()=>{expect(paperworkState(rows.map(r=>r.documentId===2?{...r,status:'pendingApproval'}:r),ids,1793900000000).complete).toBe(false);});
 it('both digests exclude test Pros and name waiting real Pros',()=>{expect(paperworkDigest([{name:'Susan Horn',paperwork_complete:false},{name:'Jenifer Whitney',paperwork_complete:false},{name:'Test',paperwork_complete:true,is_test:true}])).toBe('Paperwork: 0 Pros complete, 2 waiting (Susan Horn, Jenifer Whitney)');});
});