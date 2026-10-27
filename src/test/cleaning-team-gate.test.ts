import { describe, expect, it, vi } from 'vitest';
import { cleaningCheckoutGate } from '../../supabase/functions/_shared/cleaning-gate';

function dbFor(teamValid: boolean, teamError: unknown = null) {
  const row={cleaning_verified_at:'2026-10-27T12:00:00Z',cleaning_verified_size:'5',cleaning_size_confirmation:'confirmed',cleaning_team_ready:true,cleaning_team_id:'team'};
  const query:any={};
  for(const method of ['select','eq','contains','in','order','limit'])query[method]=vi.fn(()=>query);
  query.maybeSingle=vi.fn(async()=>({data:row,error:null}));
  return {from:vi.fn(()=>query),rpc:vi.fn(async()=>({data:teamValid,error:teamError}))};
}
describe('Estate Plus requires a verified team in checkout',()=>{
  it('refuses a readiness flag without an eligible team',async()=>{
    expect(await cleaningCheckoutGate(dbFor(false),'member@example.com','33156',5,'reservation')).toBe('cleaning_needs_team');
  });
  it('fails closed if team eligibility cannot be checked',async()=>{
    expect(await cleaningCheckoutGate(dbFor(true,{message:'unavailable'}),'member@example.com','33156',5,'reservation')).toBe('cleaning_needs_team');
  });
  it('permits verified confirmed Estate Plus with an eligible team',async()=>{
    expect(await cleaningCheckoutGate(dbFor(true),'member@example.com','33156',5,'reservation')).toBeNull();
  });
});