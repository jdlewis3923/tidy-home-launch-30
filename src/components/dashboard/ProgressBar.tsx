interface Props {
  currentStep: number;
  totalSteps: number;
}

/**
 * Calm, ultra-thin segmented progress. Filled segments use the navy ink
 * color; current segment carries a subtle pulse so progress feels alive
 * without being loud.
 */
export default function ProgressBar({ currentStep, totalSteps }: Props) {
  return (
    <div
      className="flex gap-1"
      role="progressbar"
      aria-valuenow={currentStep + 1}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
    >
      {Array.from({ length: totalSteps }).map((_, i) => {
        const filled = i <= currentStep;
        const isCurrent = i === currentStep;
        return (
          <div
            key={i}
            className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-hairline/70"
          >
            <span
              aria-hidden
              className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out rounded-full ${
                filled ? 'w-full bg-ink' : 'w-0 bg-ink'
              }`}
            />
            {isCurrent && (
              <span
                aria-hidden
                className="absolute inset-0 animate-soft-glow rounded-full bg-ink/10"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
