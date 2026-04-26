interface Props {
  currentStep: number;
  totalSteps: number;
}

export default function ProgressBar({ currentStep, totalSteps }: Props) {
  return (
    <div
      className="flex gap-1.5"
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
            className={`relative h-1.5 flex-1 overflow-hidden rounded-full transition-colors duration-500 ${
              filled ? 'bg-gradient-to-r from-gold to-gold/80' : 'bg-white/10'
            }`}
          >
            {isCurrent && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent animate-[shimmer_1.8s_ease-in-out_infinite]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
