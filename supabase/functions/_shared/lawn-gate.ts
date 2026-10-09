// A lawn reservation may only become a paid subscription once Tidy has measured
// the turf from aerial imagery (and the customer has confirmed any size-up).
// The database enforces the same rule on the subscription row; this check makes
// checkout fail early, before any card is taken.
// deno-lint-ignore no-explicit-any
export async function lawnCheckoutGate(admin: any, email: string | null | undefined, lawnSize: number | null): Promise<{ ok: true } | { ok: false; error: string; detail?: string }> {
  if (lawnSize === null || !email) return { ok: true };
  const { data, error } = await admin.rpc('lawn_checkout_gate', { _email: email });
  if (error) return { ok: false, error: 'lawn_gate_unavailable' };
  if (!data || !data.reservation_id) return { ok: true };
  if (data.block) return { ok: false, error: data.block };
  if (data.verified_size && String(data.verified_size) !== String(lawnSize)) {
    return { ok: false, error: 'lawn_size_mismatch', detail: `claimed ${lawnSize}, verified ${data.verified_size}` };
  }
  return { ok: true };
}
