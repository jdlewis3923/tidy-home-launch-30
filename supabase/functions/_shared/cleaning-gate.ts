export type CleaningVerification = {
  cleaning_verified_at: string | null;
  cleaning_verified_size: string | null;
  cleaning_size_confirmation: string | null;
  cleaning_team_ready: boolean;
};

export function cleaningVerificationError(r: CleaningVerification | null, size: number): string | null {
  if (!r?.cleaning_verified_at) return 'cleaning_requires_verification';
  if (r.cleaning_verified_size === 'custom') return 'cleaning_walkthrough_required';
  if (!['confirmed', 'not_needed'].includes(r.cleaning_size_confirmation ?? '') || String(size) !== r.cleaning_verified_size) return 'cleaning_size_confirmation_required';
  if (size === 5 && !r.cleaning_team_ready) return 'cleaning_needs_team';
  return null;
}

// Both payment entrypoints must use the same fail-closed reservation check.
export async function cleaningCheckoutGate(db: any, email: string | undefined, zip: string, size: number | null, reservationId?: string) {
  if (size === null) return null;
  if (!email) return 'cleaning_requires_verification';
  let query = db.from('reservations')
    .select('cleaning_verified_at,cleaning_verified_size,cleaning_size_confirmation,cleaning_team_ready,cleaning_team_id')
    .eq('email', email.toLowerCase()).eq('zip', zip).contains('services', ['cleaning'])
    .in('status', ['reserved', 'invited']);
  if (reservationId) query = query.eq('id', reservationId);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!error && size === 5) {
    const { data: valid, error: teamError } = await db.rpc('cleaning_team_valid', { _team: data?.cleaning_team_id ?? null });
    if (teamError || !valid) return 'cleaning_needs_team';
  }
  return error ? 'cleaning_verification_check_failed' : cleaningVerificationError(data, size);
}