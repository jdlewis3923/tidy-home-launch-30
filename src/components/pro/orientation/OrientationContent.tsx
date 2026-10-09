import type { OrientationBlock } from "@/lib/orientation";

export const SECTION_IMAGES = ["PRO-1", "PRO-3", "PRO-4", "PRO-6"];
export function OrientationImages({ block, eager = false }: { block: OrientationBlock; eager?: boolean }) {
  const image = (name: string, alt: string) => <img src={`/orientation/${name}.jpg`} loading={eager ? "eager" : "lazy"} width={1344} height={768} alt={alt} className="orientation-photo" />;
  if (block.pair) return <div className="orientation-pair"><figure>{image(`${block.pair}-R`, "Accepted result")}<figcaption className="text-primary">RIGHT / ACCEPT</figcaption></figure><figure>{image(`${block.pair}-W`, "Result to rework")}<figcaption className="text-destructive">WRONG / REWORK</figcaption></figure></div>;
  return block.image ? image(block.image, block.title) : null;
}
export function OrientationContent({ block }: { block: OrientationBlock }) {
  return <section className={`orientation-reading-block ${block.pair ? "has-pair" : ""}`}>
    <div className="orientation-reading-copy"><h2>{block.title}</h2><p className="orientation-body">{block.body}</p><div className="orientation-spanish" lang="es"><h3>{block.esTitle}</h3><p>{block.es}</p></div></div>
    <OrientationImages block={block} />
  </section>;
}
export function OrientationFooter() { return <footer className="orientation-footer">Images are illustrations of the standard.<br /><span lang="es">Las imágenes ilustran el estándar.</span></footer>; }