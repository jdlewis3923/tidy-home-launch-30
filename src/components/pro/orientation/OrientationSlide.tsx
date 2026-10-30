import { useEffect, useRef, useState } from "react";
import TidyLogo from "@/components/TidyLogo";
import { OrientationComposition } from "./OrientationComposition";
import { ORIENTATION_COPY, ORIENTATION_SECTIONS, type OrientationBlock } from "@/lib/orientation";
import { orientationVisual } from "@/lib/orientation-design";

export type OrientationSlideData = { section: typeof ORIENTATION_SECTIONS[number]; block: OrientationBlock; index: number };
export function orientationSlides(sections: readonly typeof ORIENTATION_SECTIONS[number][], copy = ORIENTATION_COPY): OrientationSlideData[] {
  return sections.flatMap(section => copy[section.id].map((block, index) => ({ section, block, index })));
}
export function OrientationSlide({ slide, page, total, exporting = false }: { slide: OrientationSlideData; page: number; total: number; exporting?: boolean }) {
  const parent = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [entered, setEntered] = useState(exporting);
  const [ready, setReady] = useState(exporting);
  useEffect(() => {
    const root = parent.current;
    if (!root) return;
    const fit = () => {
      if (window.innerWidth < 900 && !exporting) return;
      const body = root.querySelector<HTMLElement>('.orientation-slide-body');
      if (!body) return;
      const children = Array.from(body.children).filter((e): e is HTMLElement => e instanceof HTMLElement);
      children.forEach(e => { e.style.zoom = '1'; });
      const ratio = Math.min(1, body.clientHeight / body.scrollHeight, body.clientWidth / body.scrollWidth);
      if (ratio < 1) children.forEach(e => { e.style.zoom = String(ratio * .97); });
    };
    const timer = window.setTimeout(fit, 100);
    return () => window.clearTimeout(timer);
  }, [slide.block, ready, exporting]);
  useEffect(() => {
    if (exporting || !parent.current) return;
    let cancelled = false;
    // Reveal after the photographs load, not while the viewer is still waiting for them.
    Promise.all(Array.from(parent.current.querySelectorAll("img")).map(img => img.decode().catch(() => undefined)))
      .then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [exporting, slide.block]);
  useEffect(() => {
    if (exporting || !parent.current) return;
    // Reading sections mount many slides at once: start their motion on visibility, not page load.
    const observer = new IntersectionObserver(([entry]) => setEntered(entry.isIntersecting), { threshold: .12 });
    observer.observe(parent.current);
    return () => observer.disconnect();
  }, [exporting]);
  useEffect(() => {
    const element = parent.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { block, section } = slide;
  const visual = orientationVisual(block, section.id, slide.index);
  return <div ref={parent} data-slide-motion={exporting ? "static" : entered && ready ? "entered" : "waiting"} className={`orientation-slide-container tone-${visual.tone} ${entered && ready ? "is-entered" : "is-waiting"}`}><div className={`orientation-slide layout-${visual.layout} ${block.pair ? "slide-pair" : ""}`} style={{ transform: exporting ? "none" : `scale(${scale})` }}>
    <header className="orientation-slide-header"><TidyLogo /><span>{section.title} / {section.es}</span><span>{page} / {total}</span></header>
    <div className="orientation-slide-body"><OrientationComposition block={block} sectionId={section.id} index={slide.index} interactive={!exporting} /></div>
    <footer>Images are illustrations of the standard. / Las imágenes ilustran el estándar.</footer>
    {!exporting && <div className="orientation-motion-line" aria-hidden="true"><span /></div>}
  </div></div>;
}