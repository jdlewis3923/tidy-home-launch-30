interface Props {
  currentStep: number;
  totalSteps: number;
}

export default function ProgressBar({ currentStep, totalSteps }: Props) {
  return (
    <div className="flex gap-1.5" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={totalSteps}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
            i <= currentStep ? 'bg-primary' : 'bg-border'
          }`}
        />
      ))}
    </div>
  );
}
