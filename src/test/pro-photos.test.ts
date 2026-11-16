import {describe,it,expect} from 'vitest';
import {retryDelayMs,MAX_PHOTO_ATTEMPTS,PHOTO_DOC_ID,buildBadgeEmail} from '../../supabase/functions/_shared/pro-photos-rules';
describe('Connecteam photo push',()=>{
 it('targets the Photo ID + Badge Photo document',()=>expect(PHOTO_DOC_ID).toBe(841237));
 it('retries hourly for 3 tries then daily, capped',()=>{expect(retryDelayMs(1)).toBe(50*60e3);expect(retryDelayMs(3)).toBe(23*3600e3);expect(MAX_PHOTO_ATTEMPTS).toBe(10);});
 it('badge email carries badge name and vest size',()=>{const e=buildBadgeEmail({name:'A B',service:'Lawn Care Pro',badge:'Al L.',vest:'XL',links:{badge_photo:'u1',photo_id:'u2'},adminUrl:'x'});expect(e.subject).toContain('Al L.');expect(e.html).toContain('XL');});
});
