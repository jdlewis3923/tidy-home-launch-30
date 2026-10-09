import { useEffect, useRef, useState } from "react";
import TidyLogo from "@/components/TidyLogo";
import { OrientationImages } from "./OrientationContent";
import { ORIENTATION_COPY, ORIENTATION_SECTIONS, type OrientationBlock } from "@/lib/orientation";
import { orientationVisual } from "@/lib/orientation-design";

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
  const visual = orientationVisual(block, section.id, slide.index);
  return <div ref={parent} className={`orientation-slide-container tone-${visual.tone}`}><div className={`orientation-slide layout-${visual.layout} ${block.pair ? "slide-pair" : ""}`} style={{ transform: `scale(${scale})` }}>
    {visual.layout === "immersive" && <img className="orientation-immersive-image" src={visual.image} width={1536} height={1024} alt={block.title} />}
    <header className="orientation-slide-header"><TidyLogo /><span>{section.title} / {section.es}</span><span>{page} / {total}</span></header>
    <div className="orientation-slide-body"><div className="orientation-slide-copy"><h1>{block.title}</h1><p>{block.body}</p><div lang="es"><h2>{block.esTitle}</h2><p>{block.es}</p></div></div>
    {visual.layout !== "immersive" && <div className="orientation-slide-media">{visual.stat ? <div className="orientation-stat"><strong>{visual.stat}</strong><img src={visual.image} width={1344} height={768} alt={block.title} className="orientation-photo" /></div> : block.pair ? <OrientationImages block={block} eager interactive /> : <img src={visual.image} width={1536} height={1024} alt={block.title} className="orientation-photo" />}{block.image === "PRO-5" && <p className="orientation-kit-note">Illustrated kit options vary by service. Car magnet optional.<br /><span lang="es">Las opciones del kit varían según el servicio. Imán para auto opcional.</span></p>}</div>}</div>
    <footer>Images are illustrations of the standard. / Las imágenes ilustran el estándar.</footer>
  </div></div>;
}