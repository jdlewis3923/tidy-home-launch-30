import kit from "@/assets/orientation/complete-kit-v3.jpg";
import arrival from "@/assets/orientation/diverse-arrival.jpg";
import portrait from "@/assets/orientation/badge-portrait.jpg";
import photoRecord from "@/assets/orientation/photo-record.jpg";
import noAccess from "@/assets/orientation/no-access.jpg";
import assignment from "@/assets/orientation/first-assignment.jpg";
import { ORIENTATION_COPY, ORIENTATION_SECTIONS, type OrientationBlock } from "@/lib/orientation";

export const ORIENTATION_TONES = ["blue", "yellow", "white", "charcoal"] as const;
export const orientationImage = (name: string) => name === "PRO-5" ? kit : name === "PRO-1" ? arrival : name === "PRO-6" ? portrait : `/orientation/${name}.jpg`;
const compositions: Record<string, string> = {
  "Welcome to TIDY": "opener", "Our standard": "pillars", "Independent contractor relationship": "editorial",
  "Five readiness gates": "gates", "Insurance": "coverage", "Insurance wording": "quote", "Screening and privacy": "privacy",
  "Your kit": "kit", "Your badge": "badge", "Your territory": "territory", "Pay per completed visit": "pay",
  "Additional earnings": "stat", "The visit": "timeline", "Cleaning scope": "scope", "Cleaning add-ons": "boundary",
  "Lawn scope": "scope-reverse", "Car care scope": "scope-banner", "Your photo record": "photo-story",
  "Escalation": "steps", "The 48-hour standard": "stat", "Boundaries": "boundary", "Communication": "message",
  "Scenario: no access": "scenario", "Scenario: extra request": "scenario-graphic", "Scenario: damage or safety concern": "alert",
  "Your first assignment": "finale",
};
export function orientationVisual(block: OrientationBlock, sectionId: string, index: number) {
  const sectionIndex = ORIENTATION_SECTIONS.findIndex(s => s.id === sectionId);
  const offset = ORIENTATION_SECTIONS.slice(0, sectionIndex).reduce((n, s) => n + ORIENTATION_COPY[s.id].length, 0);
  const number = offset + index;
  const stat = block.title === "Five readiness gates" ? "05" : block.title === "Additional earnings" ? "40%" : block.title === "The 48-hour standard" ? "48h" : undefined;
  const layout = block.pair ? ["comparison", "comparison-rail", "comparison-focus"][number % 3] : compositions[block.title] ?? "editorial";
  // No fallback photograph: conceptual slides use graphics, never recycled pictures.
  const image = block.title === "Our standard" ? arrival : block.title === "Your photo record" ? photoRecord : block.title === "Scenario: no access" ? noAccess : block.title === "Your first assignment" ? assignment : block.image && block.title !== "Welcome to TIDY" ? orientationImage(block.image) : undefined;
  return { tone: ORIENTATION_TONES[number % 4], layout, stat, image, number };
}
export const orientationSegments = (text: string) => text.match(/[^.!?]+[.!?]+[”"]?|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [text];