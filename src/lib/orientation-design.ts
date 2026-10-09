import kit from "@/assets/orientation/complete-kit-v3.jpg";
import arrival from "@/assets/orientation/diverse-arrival.jpg";
import portrait from "@/assets/orientation/badge-portrait.jpg";
import photoRecord from "@/assets/orientation/photo-record.jpg";
import noAccess from "@/assets/orientation/no-access.jpg";
import assignment from "@/assets/orientation/first-assignment.jpg";
import welcome from "@/assets/orientation/reference-welcome.jpg";
import { REFERENCE_IMAGES } from "@/lib/orientation-reference";
import { ORIENTATION_COPY, ORIENTATION_SECTIONS, type OrientationBlock } from "@/lib/orientation";

export const ORIENTATION_TONES = ["blue", "yellow", "white", "charcoal"] as const;
const referenceKeys = ["ARRIVAL-R","ARRIVAL-W","K1-R","K1-W","K2-R","K2-W","B1-R","B1-W","B2-R","B2-W","F1-R","F1-W","F2-R","F2-W","L1-R","L1-W","L2-R","L2-W","L3-R","L3-W","L4-R","L4-W","C1-R","C1-W","C2-R","C2-W","C3-R","C3-W","C4-R","C4-W"];
export const orientationImage = (name: string) => referenceKeys.includes(name) ? REFERENCE_IMAGES[12 + referenceKeys.indexOf(name)] : name === "PRO-5" ? kit : name === "PRO-1" ? welcome : name === "PRO-6" ? portrait : `/orientation/${name}.jpg`;
const photoAssignments: Record<string, number[]> = {
  "Welcome to TIDY":[0], "Our standard":[1,2], "Independent contractor relationship":[3,4],
  "Five readiness gates":[5], "Insurance":[6], "Insurance wording":[7], "Your kit":[8],
  "Cleaning scope":[9], "Lawn scope":[10], "Car care scope":[11], "Your first assignment":[42,43],
};
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
  const layout = block.pair ? "comparison" : compositions[block.title] ?? "editorial";
  // No fallback photograph: conceptual slides use graphics, never recycled pictures.
  const references = (photoAssignments[block.title] ?? []).map(i => REFERENCE_IMAGES[i]);
  const image = block.title === "Welcome to TIDY" ? welcome : block.title === "Your photo record" ? photoRecord : block.title === "Scenario: no access" ? noAccess : block.title === "Your badge" ? portrait : block.title === "Your kit" ? kit : references[0] ?? (block.image ? orientationImage(block.image) : undefined);
  const tone = block.pair || ["Independent contractor relationship","Your kit","Insurance wording"].includes(block.title) ? "white" : ["Welcome to TIDY","Our standard","Five readiness gates","Your first assignment"].includes(block.title) ? "charcoal" : ORIENTATION_TONES[number % 4];
  return { tone, layout, stat, image, references, number };
}
export const orientationSegments = (text: string) => text.match(/[^.!?]+[.!?]+[”"]?|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [text];