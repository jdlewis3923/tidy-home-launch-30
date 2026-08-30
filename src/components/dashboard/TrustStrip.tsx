import { ENTRY_PRICE_COPY, SERVICE_AREA_LINE, trustClaims } from '@/lib/pricing-canon';

/**
 * Above-the-fold trust strip for the /signup builder.
 * One short line. Calm cream surface. No icons — pure typography.
 *
 * Claims and the entry price come from pricing-canon.ts, so nothing here can
 * drift from what we actually charge or what we are allowed to say.
 */
export default function TrustStrip() {
  const claims = trustClaims();
  return (
    <div
      role="note"
      aria-label="Service area and trust"
      className="rounded-xl border border-hairline bg-white/70 px-3.5 py-2 text-center text-[11px] font-medium tracking-tight text-ink-soft backdrop-blur"
    >
      {SERVICE_AREA_LINE}
      {claims.map((claim) => (
        <span key={claim}>
          <span className="mx-1.5 text-ink-faint">·</span>
          {claim}
        </span>
      ))}
      <span className="mx-1.5 text-ink-faint">·</span>
      {ENTRY_PRICE_COPY}
    </div>
  );
}
