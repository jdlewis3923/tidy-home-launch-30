import {describe,it,expect} from 'vitest';
import {memberJobNotes,shiftAccessNotes} from '../../supabase/functions/_shared/member-job-notes';
describe('Member service notes privacy',()=>{
 it('cleaning gets house preferences without gate fields',()=>{const n=memberJobNotes('cleaning',{gate_code:'SECRET',gate_code_enc:'CIPHER'},{},{body:'No bleach',profile:{rooms:'Office'}},null,'Susan','9–12');expect(n).toContain('Home notes: No bleach');expect(n).toContain('Home — rooms: Office');expect(n).toContain('Preferred Pro: Susan');expect(n).not.toContain('SECRET');expect(n).not.toContain('CIPHER');});
 it('car jobs get requested vehicle fields but no gate codes',()=>{const n=memberJobNotes('detailing',{}, {},null,{vehicle_make:'Toyota',vehicle_model:'Camry',vehicle_color:'Blue',vehicle_plate:'TEST123',parking_spot:'Driveway',interior_access:'Unlocked',spigot_at_parking:true,access_note:'Side entry',gate_code:'SECRET'},'', '9–12');for(const value of ['Toyota Camry Blue','TEST123','Driveway','Unlocked','Spigot at parking: Yes','Side entry'])expect(n).toContain(value);expect(n).not.toContain('SECRET');});
 it('lawn gets turf and pets without house preferences',()=>{const n=memberJobNotes('lawn',{pets:'Dog'},{lawn_measured_sqft:4200},{body:'Private rooms'},null,'','');expect(n).toContain('Measured turf sq ft: 4200');expect(n).toContain('Pets: Dog');expect(n).not.toContain('Private rooms');});
 it('gate code is shift-only content',()=>{expect(shiftAccessNotes('1234')).toBe('Gate code: 1234');expect(shiftAccessNotes(null)).toBe('');});
});
