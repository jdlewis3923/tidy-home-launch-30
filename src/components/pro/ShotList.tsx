import { Camera } from "lucide-react";
import { SHOT_RULES, type Shot } from "@/lib/visitShotList";

export default function ShotList({ label, shots }: { label: string; shots: Shot[] }) {
  return (
    <div className="rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white p-4">
      <div className="flex items-center gap-2">
        <Camera className="h-5 w-5 text-[hsl(var(--pro-blue))]" aria-hidden />
        <p className="text-[15px] font-extrabold text-[hsl(var(--pro-ink))]">{label}</p>
      </div>
      <p className="mt-1 text-[13px] text-[hsl(var(--pro-ink-soft))]">
        Before and after, every visit / Antes y después, en cada visita
      </p>
      <ol className="mt-3 space-y-2">
        {shots.map(([en, es], i) => (
          <li key={en} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pro-blue))] text-[12px] font-bold text-white">{i + 1}</span>
            <span>
              <span className="block text-[14px] font-semibold text-[hsl(var(--pro-ink))]">{en}</span>
              <span className="block text-[13px] text-[hsl(var(--pro-ink-soft))]">{es}</span>
            </span>
          </li>
        ))}
      </ol>
      <ul className="mt-3 space-y-1.5 border-t border-[hsl(var(--pro-navy)/0.07)] pt-3">
        {SHOT_RULES.map(([en, es]) => (
          <li key={en} className="text-[13px] text-[hsl(var(--pro-ink-soft))]">
            {en} <span className="block italic">{es}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
