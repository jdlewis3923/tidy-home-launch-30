import { describe, expect, it } from 'vitest';
import { proSmsAccepted } from '../../supabase/functions/_shared/pro-sms-result';

describe('Required Pro SMS acceptance', () => {
  it('requires a sent result and carrier message identifier', () => {
    expect(proSmsAccepted({ok:true,sent:true,message_sid:'SM-test'})).toBe(true);
    expect(proSmsAccepted({ok:true,sent:true,message_sid:null})).toBe(false);
  });
  it('does not report a skipped, dry-run or digest-held text as sent', () => {
    expect(proSmsAccepted({ok:true,sent:false,reason:'duplicate_idempotency_key'})).toBe(false);
    expect(proSmsAccepted({ok:true,sent:false,dry_run:true})).toBe(false);
    expect(proSmsAccepted({ok:true,sent:false,held_for_digest:true})).toBe(false);
  });
});