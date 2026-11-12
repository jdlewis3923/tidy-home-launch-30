import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { askedFields, missingKeys, kitComplete } from '@/lib/proApplication';
import { paperworkState } from '../../supabase/functions/_shared/paperwork-rules';
import { paperworkSteps, PAPERWORK_IDS } from '../../supabase/functions/_shared/paperwork-email';

const kit = { street: '1 Main St', vest_size: 'L', badge_name: 'Maria G.', ship_same: 'yes', ec_name: 'Ana', ec_relationship: 'Sister', ec_phone: '3055551234', vehicle_year: '2019', vehicle_make: 'Toyota', vehicle_model: 'Camry', vehicle_color: 'Gray', vehicle_plate: 'ABC123', magnet_opt_in: 'no' };
const files = { photo_id: { path: 'x' }, badge_photo: { path: 'y' } };

describe('website Pro application', () => {
  it('server copy matches the form copy', () => {
    expect(readFileSync('supabase/functions/_shared/pro-application.ts', 'utf8')).toBe(readFileSync('src/lib/proApplication.ts', 'utf8'));
  });
  it('never asks for anything already on file', () => {
    const asked = askedFields('lawn', {}, { first_name: 'Aleksandar', years: '7', days: ['tue', 'fri'] }, ['equipment']).map((f) => f.key);
    expect(asked).not.toContain('first_name');
    expect(asked).not.toContain('years');
    expect(asked).not.toContain('days');
    expect(asked).not.toContain('eq_mower');
    expect(asked).toContain('vest_size');
  });
  it('requires an equipment photo only for equipment the applicant owns', () => {
    expect(missingKeys('cleaning', { eq_vacuum: 'yes' }, {})).toContain('photo_vacuum');
    expect(missingKeys('cleaning', { eq_vacuum: 'no' }, {})).not.toContain('photo_vacuum');
  });
  it('requires photo ID and badge photo; resume is optional', () => {
    const m = missingKeys('car', {}, {});
    expect(m).toContain('photo_id');
    expect(m).toContain('badge_photo');
    expect(m).not.toContain('resume');
  });
  it('kit is complete only with kit answers plus both photos', () => {
    expect(kitComplete('cleaning', kit, files)).toBe(true);
    expect(kitComplete('cleaning', kit, { photo_id: {} })).toBe(false);
    expect(kitComplete('cleaning', { ...kit, ship_same: 'no' }, files)).toBe(false);
  });
  it('badge name must be first name + last initial', () => {
    expect(missingKeys('cleaning', { ...kit, badge_name: 'Maria Gonzalez' }, files)).toContain('badge_name');
  });
});

describe('Connecteam paperwork is agreement → W-9 → COI only', () => {
  it('no intake or photo ID document is required', () => {
    expect(PAPERWORK_IDS).not.toHaveProperty('intake');
    expect(PAPERWORK_IDS).not.toHaveProperty('photo_id');
    expect(paperworkSteps('cleaning', {}, false, false).map((s) => s.key)).toEqual(['agreement', 'w9', 'coi']);
  });
  it('agreement + W-9 + approved COI completes Connecteam paperwork', () => {
    const rows = [{ documentId: 1, status: 'completed' }, { documentId: 2, status: 'approved' }, { documentId: 3, status: 'completed', signedAt: 100 }];
    expect(paperworkState(rows, { w9: 1, coi: 2, agreement: 3 }).complete).toBe(true);
    expect(paperworkState(rows.slice(1), { w9: 1, coi: 2, agreement: 3 }).complete).toBe(false);
  });
});

describe('kit shipping address', () => {
  it('asks for a shipping address when no home address is on file', () => {
    const keys = askedFields('cleaning', {}, { first_name: 'Susan' }, ['basics', 'equipment', 'work', 'availability', 'consent']).map((f) => f.key);
    expect(keys).toContain('ship_street');
    expect(keys).not.toContain('ship_same');
  });
});
