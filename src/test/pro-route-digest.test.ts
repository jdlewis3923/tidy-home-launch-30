import { describe,expect,it } from 'vitest';
import { digestText } from '../../supabase/functions/_shared/pro-day-digest';
const visits=[{id:'test-route',scheduled_start:'2026-10-28T14:00:00Z',service_type:'cleaning',street:'Private street',zip:'33156',access_notes:'Private lockbox',gate_code:'secret-test-code',parking_notes:'Private garage',pet_notes:'Private home'}];
describe('Pro route reminders',()=>{
  it('sorts the route and includes the first arrival window',()=>{
    const later={...visits[0],id:'later',scheduled_start:'2026-10-28T18:00:00Z'};
    const first={...visits[0],scheduled_end:'2026-10-28T16:00:00Z'};
    const result=digestText([later,first],'tomorrow');
    expect(result.title).toContain('first at 10:00 AM');
    expect(result.body.split('\n')[0]).toContain('10:00 AM – 12:00 PM');
  });
  it('does not leak address or access in the SMS route summary',()=>{
    const text=JSON.stringify(digestText(visits,'tomorrow'));
    expect(text).toContain('33156');
    expect(text).not.toContain('Private street');
    expect(text).not.toContain('Private lockbox');
    expect(text).not.toContain('secret-test-code');
    expect(text).not.toContain('Private garage');
  });
  it('builds Spanish summaries for Spanish Pros with the first Miami window',()=>{
    const digest=digestText(visits,'tomorrow','es');
    expect(digest.title).toContain('1 visita mañana');
    expect(digest.title).toContain('10:00 AM');
    expect(digest.body).toContain('Limpieza');
  });
});