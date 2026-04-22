/**
 * Subtle ambient gradient orbs used to break the flat-white monotony of
 * background sections on landing pages. Pure decoration; aria-hidden.
 *
 * Use as a sibling inside a `relative overflow-hidden` section.
 */
interface Props {
  /** "primary" = blue tint, "gold" = warm tint, "mixed" = both */
  tone?: "primary" | "gold" | "mixed";
}

const SectionDecor = ({ tone = "primary" }: Props) => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {(tone === "primary" || tone === "mixed") && (
      <div
        className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-[0.18]"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }}
      />
    )}
    {(tone === "gold" || tone === "mixed") && (
      <div
        className="absolute -bottom-32 -right-24 w-[480px] h-[480px] rounded-full blur-3xl opacity-[0.14]"
        style={{ background: "radial-gradient(circle, hsl(var(--gold)) 0%, transparent 70%)" }}
      />
    )}
    {tone === "mixed" && (
      <div
        className="absolute top-1/2 left-1/3 w-[300px] h-[300px] -translate-y-1/2 rounded-full blur-3xl opacity-[0.10]"
        style={{ background: "radial-gradient(circle, hsl(var(--primary-deep)) 0%, transparent 70%)" }}
      />
    )}
  </div>
);

export default SectionDecor;
