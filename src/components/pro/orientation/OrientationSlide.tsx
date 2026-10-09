import { useEffect, useRef, useState } from "react";
import TidyLogo from "@/components/TidyLogo";
import { OrientationComposition } from "./OrientationComposition";
import { ORIENTATION_COPY, ORIENTATION_SECTIONS, type OrientationBlock } from "@/lib/orientation";
import { orientationVisual } from "@/lib/orientation-design";

export type OrientationSlideData = { section: typeof ORIENTATION_SECTIONS[number]; block: OrientationBlock; index: number };
export function orientationSlides(sections: readonly typeof ORIENTATION_SECTIONS[number][]): OrientationSlideData[] {
  return sections.flatMap(section => ORIENTATION_COPY[section.id].map((block, index) => ({ section, block, index })));
}
export function OrientationSlide({ slide, page, total, exporting = false }: { slide: OrientationSlideData; page: number; total: number; exporting?: boolean }) {
  const parent = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = parent.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { block, section } = slide;
  const visual = orientationVisual(block, section.id, slide.index);
  return <div ref={parent} className={`orientation-slide-container tone-${visual.tone}`}><div className={`orientation-slide layout-${visual.layout} ${block.pair ? "slide-pair" : ""}`} style={{ transform: exporting ? "none" : `scale(${scale})` }}>
    <header className="orientation-slide-header"><TidyLogo /><span>{section.title} / {section.es}</span><span>{page} / {total}</span></header>
    <div className="orientation-slide-body"><OrientationComposition block={block} sectionId={section.id} index={slide.index} interactive={!exporting} /></div>
    <footer>Images are illustrations of the standard. / Las imágenes ilustran el estándar.</footer>
  </div></div>;
}