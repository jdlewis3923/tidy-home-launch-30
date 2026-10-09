import { useEffect, useRef, useState } from "react";
import TidyLogo from "@/components/TidyLogo";
import { OrientationImages } from "./OrientationContent";
import { ORIENTATION_COPY, ORIENTATION_SECTIONS, type OrientationBlock } from "@/lib/orientation";

export type OrientationSlideData = { section: typeof ORIENTATION_SECTIONS[number]; block: OrientationBlock; index: number };
export function orientationSlides(sections: readonly typeof ORIENTATION_SECTIONS[number][]): OrientationSlideData[] {
  return sections.flatMap(section => ORIENTATION_COPY[section.id].map((block, index) => ({ section, block, index })));
}
export function OrientationSlide({ slide, page, total }: { slide: OrientationSlideData; page: number; total: number }) {
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
  return <div ref={parent} className="orientation-slide-container"><div className={`orientation-slide ${block.pair ? "slide-pair" : ""}`} style={{ transform: `scale(${scale})` }}>
    <header className="orientation-slide-header"><TidyLogo /><span>{section.title} / {section.es}</span><span>{page} / {total}</span></header>
    <div className="orientation-slide-body"><div className="orientation-slide-copy"><h1>{block.title}</h1><p>{block.body}</p><div lang="es"><h2>{block.esTitle}</h2><p>{block.es}</p></div></div>
    <div className="orientation-slide-media"><OrientationImages block={block.image || block.pair ? block : { ...block, image: ["PRO-1", "PRO-3", "PRO-4", "PRO-6"][ORIENTATION_SECTIONS.indexOf(section)] }} eager /></div></div>
    <footer>Images are illustrations of the standard. / Las imágenes ilustran el estándar.</footer>
  </div></div>;
}