import Reveal from "./Reveal";

interface Props {
  /** Plain-text version with the price segment marked with `**`, e.g. "...locks you in at **$159**..." */
  text: string;
}

/**
 * Single understated line of value-anchoring copy above the plans grid.
 * Wrap the price segment with **double asterisks** to bold + brand-color it.
 */
const SavingsCallout = ({ text }: Props) => {
  // Split on **...** segments
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Reveal className="text-center max-w-3xl mx-auto mb-6">
      <p className="text-sm md:text-base text-text-mid leading-relaxed">
        {parts.map((p, i) => {
          if (p.startsWith("**") && p.endsWith("**")) {
            return (
              <span key={i} className="font-bold text-primary">
                {p.slice(2, -2)}
              </span>
            );
          }
          return <span key={i}>{p}</span>;
        })}
      </p>
    </Reveal>
  );
};

export default SavingsCallout;
