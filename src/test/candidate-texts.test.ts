import { describe, it, expect } from 'vitest';
import { mergeTextMessages, phoneKey, textAttention, type TextMessage } from '../lib/candidate-texts';
const inbound: TextMessage = {id:'in',at:'2026-10-23T15:56:00Z',direction:'inbound',body:'Reply',status:'received',manual:false};
describe('candidate text organization', () => {
  it('matches US phone formatting without joining blank numbers', () => { expect(phoneKey('+1 (786) 346-7983')).toBe('7863467983'); expect(phoneKey(null)).toBe(''); });
  it('an automated reminder does not clear a candidate needing an owner reply', () => expect(textAttention([inbound,{...inbound,id:'auto',direction:'outbound',at:'2026-10-23T16:00:00Z',status:'sent'}],false,null,null)).toBe('reply'));
  it('an accepted personal reply clears reply attention', () => expect(textAttention([inbound,{...inbound,id:'out',direction:'outbound',manual:true,at:'2026-10-23T16:00:00Z',status:'accepted'}],false,null,null)).toBe('waiting'));
  it('a queued personal reply does not clear reply attention', () => expect(textAttention([inbound,{...inbound,id:'out',direction:'outbound',manual:true,at:'2026-10-23T16:00:00Z',status:'queued'}],false,null,null)).toBe('reply'));
  it('submitted candidates never need application reminders', () => expect(textAttention([],true,'2026-10-23T15:00:00Z',null,Date.parse('2026-10-23T16:00:00Z'))).toBe('submitted'));
  it('reminder attention comes from the existing unsent nudge deadline', () => expect(textAttention([],false,'2026-10-23T15:00:00Z',null,Date.parse('2026-10-23T16:00:00Z'))).toBe('reminder'));
  it('an already nudged candidate is not marked for another reminder', () => expect(textAttention([],false,'2026-10-23T15:00:00Z','2026-10-23T15:01:00Z',Date.parse('2026-10-23T16:00:00Z'))).toBe('not_sent'));
  it('deduplicates a Twilio message and retains known exact wording', () => {const rows=mergeTextMessages([{...inbound,sid:'SM1'},{...inbound,id:'log',sid:'SM1',body:null}]); expect(rows).toHaveLength(1); expect(rows[0].body).toBe('Reply');});
});