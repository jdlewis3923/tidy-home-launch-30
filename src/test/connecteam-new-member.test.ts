import { describe, it, expect, vi } from 'vitest';
import { registerTeamMember, isHireTestUser } from '../../supabase/functions/_shared/connecteam-new-member';
const user={userId:31164833,firstName:'ZZ',lastName:'Hire Test',phoneNumber:'+13055550142',email:'jdlewis3923@gmail.com',customFields:[{name:'Position',value:[{value:'House Cleaning Pro'}]}]};
describe('Connecteam new team member',()=>{
 it('creates the cleaning pay profile through the production registration path',async()=>{
  const upsert=vi.fn(async()=>({error:null}));const db={from:()=>({upsert})};
  const profile=await registerTeamMember(db,user,true);
  expect(profile).toEqual({connecteam_user_id:31164833,name:'ZZ Hire Test',service_line:'cleaning',email:'jdlewis3923@gmail.com',applicant_id:null,is_test:true});
  expect(upsert).toHaveBeenCalledWith(profile,{onConflict:'connecteam_user_id'});
 });
 it('only recognizes the exact owner-only fake user',()=>{
  expect(isHireTestUser(user)).toBe(true);
  expect(isHireTestUser({...user,email:'someone@example.com'})).toBe(false);
  expect(isHireTestUser({...user,firstName:'Justin'})).toBe(false);
 });
});