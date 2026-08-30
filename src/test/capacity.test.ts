// Capacity guard. Justin must never discover he is out of capacity from a
// customer complaint, so the math here is pinned and the edge-function mirror
// must not drift from the client config.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  BILLABLE_HOURS_PER_PRO_PER_MONTH,
  COMFORT_CEILING,
  HIRING_CYCLE_DAYS,
  HOURS_PER_CUSTOMER_PER_MONTH,
  computeCapacity,
  worstService,
} from '@/lib/capacity-config';

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('capacity config', () => {
  it('the edge mirror is byte-identical to the client config', () => {
    expect(read('supabase/functions/_shared/capacity-config.ts')).toBe(read('src/lib/capacity-config.ts'));
  });

  it('the tunable constants are exactly what the owner set', () => {
    expect(BILLABLE_HOURS_PER_PRO_PER_MONTH).toBe(161);
    expect(COMFORT_CEILING).toBe(0.85);
    expect(HIRING_CYCLE_DAYS).toBe(26);
    expect(HOURS_PER_CUSTOMER_PER_MONTH).toEqual({ cleaning: 6.34, lawn: 1.96, shine: 2.89 });
  });
});

describe('capacity math', () => {
  it('one pro serves 25 cleaning customers and 82 lawn customers', () => {
    const cleaning = computeCapacity({ service: 'cleaning', activeCustomers: 0, assignedPros: 1, netNewCustomers: 0 });
    const lawn = computeCapacity({ service: 'lawn', activeCustomers: 0, assignedPros: 1, netNewCustomers: 0 });
    expect(cleaning.maxAtCapacity).toBe(25);
    expect(lawn.maxAtCapacity).toBe(82);
  });

  it('cleaning trips before lawn at identical customer counts and growth', () => {
    const args = { activeCustomers: 18, assignedPros: 1, netNewCustomers: 6 } as const;
    const cleaning = computeCapacity({ service: 'cleaning', ...args });
    const lawn = computeCapacity({ service: 'lawn', ...args });
    expect(cleaning.daysToCeiling!).toBeLessThan(lawn.daysToCeiling!);
    expect(cleaning.status).toBe('amber');
    expect(lawn.status).toBe('green');
  });

  it('customers with zero assigned pros is RED immediately', () => {
    const r = computeCapacity({ service: 'lawn', activeCustomers: 4, assignedPros: 0, netNewCustomers: 1 });
    expect(r.status).toBe('red');
    expect(r.fillPct).toBeNull();
    expect(r.message).toContain('past what you can staff');
  });

  it('no customers and no pro is not an alarm', () => {
    const r = computeCapacity({ service: 'shine', activeCustomers: 0, assignedPros: 0, netNewCustomers: 0 });
    expect(r.status).toBe('green');
  });

  it('over 100% fill is RED and names how many customers are past staffing', () => {
    const r = computeCapacity({ service: 'cleaning', activeCustomers: 30, assignedPros: 1, netNewCustomers: 2 });
    expect(r.status).toBe('red');
    expect(r.overBy).toBe(5);
    expect(r.message).toBe('Over capacity — 5 customers past what you can staff');
  });

  it('flat or shrinking growth says "not growing" instead of dividing by zero', () => {
    for (const netNewCustomers of [0, -3]) {
      const r = computeCapacity({ service: 'cleaning', activeCustomers: 10, assignedPros: 1, netNewCustomers });
      expect(r.daysToCeiling).toBeNull();
      expect(r.postTheJobInDays).toBeNull();
      expect(r.message).toContain('Not growing');
      expect(r.status).toBe('green');
    }
  });

  it('amber says post today; green says post in N days', () => {
    const amber = computeCapacity({ service: 'cleaning', activeCustomers: 18, assignedPros: 1, netNewCustomers: 6 });
    expect(amber.status).toBe('amber');
    expect(amber.message).toContain('Post the job today');
    expect(amber.message).toContain('hiring takes 26');

    const green = computeCapacity({ service: 'lawn', activeCustomers: 10, assignedPros: 1, netNewCustomers: 4 });
    expect(green.status).toBe('green');
    expect(green.message).toMatch(/^Post the job in \d+ days$/);
    expect(green.postTheJobInDays).toBeCloseTo(green.daysToCeiling! - 26, 6);
  });

  it('headroom is measured to the 85% comfort ceiling, not to 100%', () => {
    const r = computeCapacity({ service: 'cleaning', activeCustomers: 0, assignedPros: 1, netNewCustomers: 1 });
    expect(r.maxAtComfortCeiling).toBe(21);
    expect(r.headroomCustomers).toBeCloseTo((161 * 0.85) / 6.34, 6);
  });

  it('the banner surfaces the worst service', () => {
    const results = [
      computeCapacity({ service: 'lawn', activeCustomers: 5, assignedPros: 1, netNewCustomers: 1 }),
      computeCapacity({ service: 'cleaning', activeCustomers: 30, assignedPros: 1, netNewCustomers: 1 }),
      computeCapacity({ service: 'shine', activeCustomers: 20, assignedPros: 1, netNewCustomers: 5 }),
    ];
    expect(worstService(results)!.service).toBe('cleaning');
  });
});
