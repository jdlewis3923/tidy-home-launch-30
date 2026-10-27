import { describe, expect, it } from 'vitest';
import { cleaningPayBreakdown, cleaningRescheduleRule, rotatingCleaningTask, cleaningTeamCanClose } from '@/lib/cleaningOperations';
describe('Estate operations rules', () => {
  it('a paired visit requires both check-outs, zones, and Lead inspection',()=>{
    expect(cleaningTeamCanClose(true,true,false,true,true)).toBe(false);
    expect(cleaningTeamCanClose(true,true,true,false,true)).toBe(false);
    expect(cleaningTeamCanClose(true,true,true,true,false)).toBe(false);
    expect(cleaningTeamCanClose(true,true,true,true,true)).toBe(true);
  });
  it('Estate first visit pays $255 and later visits $170', () => {
    expect(cleaningPayBreakdown(4, true, false).visitPay).toBe(25500);
    expect(cleaningPayBreakdown(4, false, false).visitPay).toBe(17000);
  });
  it('owner plus helper receives $357 first and $238 thereafter', () => {
    expect(cleaningPayBreakdown(5, true, false).visitPay).toBe(35700);
    expect(cleaningPayBreakdown(5, false, false).visitPay).toBe(23800);
  });
  it('paired Pros receive $178.50 first and $119 thereafter each', () => {
    expect(cleaningPayBreakdown(5, true, true).visitPay).toBe(17850);
    expect(cleaningPayBreakdown(5, false, true).visitPay).toBe(11900);
  });
  it.each(['redo','lockout','late_cancel','unsafe'] as const)('%s pays half the normal rate', outcome => {
    expect(cleaningPayBreakdown(5, true, true, outcome).visitPay).toBe(5950);
  });
  it('add-ons pay 40 percent or split that pay equally when completed together', () => {
    expect(cleaningPayBreakdown(5, false, true, 'complete', 5500).addonPay).toBe(2200);
    expect(cleaningPayBreakdown(5, false, true, 'complete', 5500, true).addonPay).toBe(1100);
  });
  it('48 hours allows seven-day move or credited skip, at most two skips', () => {
    expect(cleaningRescheduleRule(48, 0, false)).toBe('within_7_days');
    expect(cleaningRescheduleRule(48, 1, true)).toBe('credit');
    expect(cleaningRescheduleRule(48, 2, true)).toBe('skip_limit');
  });
  it('24 hours permits same-week move but not a credited skip', () => {
    expect(cleaningRescheduleRule(24, 0, false)).toBe('same_week');
    expect(cleaningRescheduleRule(24, 0, true)).toBe('skip_not_available');
    expect(cleaningRescheduleRule(23.99, 0, false)).toBe('used');
  });
  it('rotates five deep tasks then repeats', () => {
    expect(Array.from({length:6},(_,i)=>rotatingCleaningTask(i))).toEqual(['baseboards','blinds','fans_fixtures','cabinet_fronts','vents','baseboards']);
  });
});