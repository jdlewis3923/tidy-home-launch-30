/**
 * Above-the-fold trust strip for the /signup builder.
 * One short line. Calm cream surface. No icons — pure typography.
 */
export default function TrustStrip() {
  return (
    <div
      role="note"
      aria-label="Service area and trust"
      className="rounded-xl border border-hairline bg-white/70 px-3.5 py-2 text-center text-[11px] font-medium tracking-tight text-ink-soft backdrop-blur"
    >
      Pinecrest 33156 · Kendall 33183/33186
      <span className="mx-1.5 text-ink-faint">·</span>
      Bonded
      <span className="mx-1.5 text-ink-faint">·</span>
      Insured
      <span className="mx-1.5 text-ink-faint">·</span>
      Bilingual Pros (EN + ES)
      <span className="mx-1.5 text-ink-faint">·</span>
      Same Pro Every Visit
      <span className="mx-1.5 text-ink-faint">·</span>
      Starting at $135/mo
    </div>
  );
}
