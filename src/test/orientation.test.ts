import { describe, expect, it } from "vitest";
import { ORIENTATION_COPY, ORIENTATION_SECTIONS, stageNumber } from "@/lib/orientation";
import { orientationSlides } from "@/components/pro/orientation/OrientationSlide";
import { orientationVisual, orientationImage } from "@/lib/orientation-design";
import { ORIENTATION_STANDARDS } from "@/lib/orientation-standards";

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
  it("uses reference compositions, a photographic opener and all 44 reference photos once", () => {
    const slides = orientationSlides(ORIENTATION_SECTIONS);
    const visuals = slides.map(s => orientationVisual(s.block, s.section.id, s.index));
    expect(new Set(visuals.map(v => v.tone)).size).toBe(4);
    expect(new Set(visuals.map(v => v.layout)).size).toBeGreaterThanOrEqual(18);
    expect(visuals[0].layout).toBe("opener");
    expect(visuals[0].image).toContain("reference-welcome");
    const images = visuals.flatMap((v,i) => slides[i].block.pair ? [orientationImage(`${slides[i].block.pair}-R`),orientationImage(`${slides[i].block.pair}-W`)] : v.image ? [v.image] : []);
    expect(new Set(images).size).toBe(images.length);
    const referenceImages = visuals.flatMap((v,i) => slides[i].block.pair ? [orientationImage(`${slides[i].block.pair}-R`),orientationImage(`${slides[i].block.pair}-W`)] : v.references);
    expect(referenceImages).toHaveLength(44);
    expect(new Set(referenceImages).size).toBe(44);
    expect(orientationImage("PRO-5")).toContain("complete-kit");
    expect(orientationImage("PRO-1")).toContain("reference-welcome");
  });
  it("includes bilingual acceptance and rework instructions for all 15 comparisons", () => {
    const pairs = orientationSlides(ORIENTATION_SECTIONS).filter(s => s.block.pair);
    expect(Object.keys(ORIENTATION_STANDARDS)).toHaveLength(15);
    for (const { block } of pairs) {
      const directions = ORIENTATION_STANDARDS[block.pair!];
      for (const text of Object.values(directions)) expect(text.length).toBeGreaterThan(40);
      expect(orientationImage(`${block.pair}-R`)).toContain("/hd/");
      expect(orientationImage(`${block.pair}-W`)).toContain("/hd/");
    }
    for (let i = 1; i <= 6; i++) expect(orientationImage(`PRO-${i}`)).toContain("/hd/");
  });
});