import kit from "@/assets/orientation/complete-kit.jpg";
import arrival from "@/assets/orientation/diverse-arrival.jpg";
import { ORIENTATION_SECTIONS, type OrientationBlock } from "@/lib/orientation";

export const ORIENTATION_TONES = ["blue", "yellow", "white", "charcoal"] as const;
export const orientationImage = (name: string) => name === "PRO-5" ? kit : name === "PRO-1" ? arrival : `/orientation/${name}.jpg`;
export function orientationVisual(block: OrientationBlock, sectionId: string, index: number) {
  const sectionIndex = ORIENTATION_SECTIONS.findIndex(s => s.id === sectionId);
  const offset = ORIENTATION_SECTIONS.slice(0, sectionIndex).reduce((n, s) => n + ({ "before-you-work": 10, "what-it-pays": 2, "on-the-job": 20, "when-it-matters": 9 }[s.id]), 0);
  const number = offset + index;
  const stat = block.title === "Five readiness gates" ? "05" : block.title === "Additional earnings" ? "40%" : block.title === "The 48-hour standard" ? "48h" : undefined;
  const layout = block.pair ? "comparison" : stat ? "stat" : index === 0 && sectionId !== "what-it-pays" ? "immersive" : number % 3 === 0 ? "reverse" : "split";
  return { tone: ORIENTATION_TONES[number % 4], layout, stat, image: orientationImage(block.image ?? ["PRO-1", "PRO-3", "PRO-4", "PRO-6"][Math.max(0, sectionIndex)]) };
}