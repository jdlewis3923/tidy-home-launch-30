import { describe, expect, it } from 'vitest';
import { pickEmailArt } from '../../supabase/functions/_shared/email-brand';

describe('email intent artwork', () => {
  it.each([
    ['Still open: Test needs help', 'support-20261018'],
    ['Meet the team', 'team-20261018'],
    ['Conoce a tu equipo', 'team-20261018'],
    ['Your cleaning payment failed', 'billing'],
    ['Your lawn size is verified', 'lawn'],
    ['Your equipment proof photos', 'equipment-20261018'],
    ['Your badge photo needs a retake', 'photo'],
    ['Your visit is confirmed', 'visit'],
    ['Your visit review', 'community'],
    ['Your referral credit', 'community'],
    ['Your background check from Tidy', 'verify'],
    ['Your contractor agreement', 'contract'],
    ['Your weekly KPI digest', 'report'],
    ['Your Car Care plan', 'car'],
  ])('%s has congruent artwork', (topic, filename) => {
    expect(pickEmailArt(topic).image).toContain(`email%2F${filename}.jpg`);
  });
});