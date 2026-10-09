import { describe, expect, it } from "vitest";
import { ORIENTATION_COPY, ORIENTATION_SECTIONS, stageNumber } from "@/lib/orientation";
import { orientationSlides } from "@/components/pro/orientation/OrientationSlide";

describe("orientation preview preserves content and stage gates", () => {
  it("keeps exactly four sections and the specified gates", () => {
    expect(ORIENTATION_SECTIONS).toHaveLength(4);
    expect(ORIENTATION_SECTIONS.map(s => s.min)).toEqual([3, 5, 5, 6]);
    expect(stageNumber("unknown")).toBe(0);
  });
  it("only includes slides belonging to unlocked sections", () => {
    for (const [stage, count] of [["applied", 0], ["agreement", 1], ["background", 3], ["insured", 4]] as const) {
      const sections = ORIENTATION_SECTIONS.filter(s => stageNumber(stage) >= s.min);
      expect(sections).toHaveLength(count);
      expect(orientationSlides(sections).every(s => s.section.min <= stageNumber(stage))).toBe(true);
    }
  });
  it("uses the exact bilingual source blocks without changing content", () => {
    const slides = orientationSlides(ORIENTATION_SECTIONS);
    expect(slides).toHaveLength(41);
    for (const slide of slides) {
      expect(slide.block).toBe(ORIENTATION_COPY[slide.section.id][slide.index]);
      expect(slide.block.title && slide.block.body && slide.block.esTitle && slide.block.es).toBeTruthy();
    }
    expect(slides.filter(s => s.block.pair)).toHaveLength(15);
  });
});