import { describe,it,expect } from 'vitest';
import { CONTRACT_TEMPLATE_SEED } from '../../supabase/functions/_shared/contract-template-seed';
import { contractBlocks,fillContract } from '@/lib/contract-document';
import { signingChecks } from '@/lib/signing-day';
import fs from 'node:fs';
describe('Service-specific exact contractor agreements',()=>{
 for(const service of ['cleaning','lawn']) {
  it(`${service} uses version 2026-10-29b and changes only section 4.9`,()=>{const t=CONTRACT_TEMPLATE_SEED.find(t=>t.service===service);expect(t?.version).toBe('2026-10-29b');const original=fs.readFileSync(`supabase/functions/_shared/contracts/${service}-2026-10-29.txt`,'utf8');expect(t?.body).toBe(original.replace('50% of the visit rate for the return trip.','50% of the visit rate for the return trip. Tidy pays for one redo per Member every 60 days; any further redo for the same Member within those 60 days is unpaid.'));});
 }
 it('cleaning retains Estate Plus team pay of $238 and first visit $357',()=>{const t=CONTRACT_TEMPLATE_SEED.find(t=>t.service==='cleaning');expect(t?.body).toContain('$238 per team visit');expect(t?.body).toContain('$357 for Estate Plus');});
 it('lawn retains flat pay $18, $26, $40',()=>{const t=CONTRACT_TEMPLATE_SEED.find(t=>t.service==='lawn');const tables=contractBlocks(t?.body??'').filter(b=>b.kind==='table');expect(tables[0]?.rows.slice(1).map(r=>r[3])).toEqual(['$18','$26','$40']);});
 it('fills every signature placeholder and preserves unknown placeholders',()=>{expect(fillContract('{legal_name} | {business_name} | {phone} | {email} | {pro_number} | {signed_date}',{legal_name:'Test Pro',business_name:'—',phone:'3055550181',email:'pro@example.com',pro_number:'TIDY-0001',signed_date:'October 29, 2026'})).toBe('Test Pro | — | 3055550181 | pro@example.com | TIDY-0001 | October 29, 2026');});
 it('getting started has exactly the five requested checks and no W-9',()=>{expect(signingChecks.map(r=>r[0])).toEqual(['background','insurance','payouts','availability','sizes']);});
 it('both bodies retain five-star review $25 and 50/4.8/60 tier requirements',()=>{for(const t of CONTRACT_TEMPLATE_SEED){expect(t.body).toContain('4.5 Review bonus — $25.');expect(t.body).toContain('50+ visits, holds a 4.8+ rating and has worked with Tidy 60+ days');}});
});
