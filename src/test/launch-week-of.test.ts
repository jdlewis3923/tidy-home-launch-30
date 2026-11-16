import {describe,it,expect} from 'vitest';
import {startsLine} from '@/lib/launch';
const cfg:any={cleaning:{first_visit_date:'2026-12-07'},lawn:{first_visit_date:'2026-12-07'},car:{first_visit_date:null}};
describe('founding start wording',()=>{
 it('says the week of December 7 for founding copy',()=>expect(startsLine(cfg,'en',['cleaning'],'long',true)).toBe('First visits begin the week of Monday, December 7'));
 it('Spanish week-of phrasing',()=>expect(startsLine(cfg,'es',['lawn'],'long',true)).toContain('la semana del lunes, 7 de diciembre'));
});
