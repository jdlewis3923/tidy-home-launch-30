import { describe, expect, it } from 'vitest';
import { requiredBookingConsentsComplete } from '../lib/booking-consent';

describe('required booking agreements', () => {
  it('blocks unchecked agreements by default', () => {
    expect(requiredBookingConsentsComplete([false, false, false])).toBe(false);
  });
  it('blocks until every required agreement is checked', () => {
    expect(requiredBookingConsentsComplete([true, false, true])).toBe(false);
    expect(requiredBookingConsentsComplete([true, true, true])).toBe(true);
  });
  it('does not treat missing values as assent', () => {
    expect(requiredBookingConsentsComplete([true, undefined])).toBe(false);
    expect(requiredBookingConsentsComplete([true, 'true'])).toBe(false);
    expect(requiredBookingConsentsComplete([])).toBe(false);
  });
});