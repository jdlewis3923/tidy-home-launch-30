import type { OrientationBlock } from "@/lib/orientation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Columns2, Check, RotateCcw, X } from "lucide-react";
import { orientationImage } from "@/lib/orientation-design";
import { ORIENTATION_STANDARDS } from "@/lib/orientation-standards";

export const SECTION_IMAGES = ["PRO-1", "PRO-3", "PRO-4", "PRO-6"];
export function OrientationImages({ block, eager = false, interactive = false }: { block: OrientationBlock; eager?: boolean; interactive?: boolean }) {
  const [mode, setMode] = useState<"both" | "right" | "wrong">("both");
  const image = (name: string, alt: string) => <img src={orientationImage(name)} loading={eager ? "eager" : "lazy"} width={1344} height={768} alt={alt} className="orientation-photo" />;
  if (block.pair) {
    const standard = ORIENTATION_STANDARDS[block.pair];
    return <div className="orientation-comparison">{interactive && <div className="orientation-comparison-controls" role="group" aria-label="Compare results / Comparar resultados">{([['both', Columns2, 'Both / Ambos'], ['right', Check, 'Right / Correcto'], ['wrong', RotateCcw, 'Rework / Corregir']] as const).map(([value, Icon, label]) => <Button key={value} size="sm" variant="outline" aria-pressed={mode === value} onClick={() => setMode(value)}><Icon />{label}</Button>)}</div>}<div key={mode} className={`orientation-pair ${mode !== "both" ? "single-result" : ""}`}>
      <figure hidden={mode === "wrong"}>{image(`${block.pair}-R`, "Accepted result")}<figcaption className="orientation-accept"><Check aria-hidden="true" /> RIGHT / CORRECTO</figcaption><ul className="orientation-result-direction"><li>{standard.right}<p lang="es">{standard.rightEs}</p></li></ul></figure>
      <figure hidden={mode === "right"}>{image(`${block.pair}-W`, "Result to rework")}<figcaption className="orientation-rework"><X aria-hidden="true" /> REWORK / CORREGIR</figcaption><ul className="orientation-result-direction"><li>{standard.wrong}<p lang="es">{standard.wrongEs}</p></li></ul></figure>
    </div></div>;
  }
  return block.image ? image(block.image, block.title) : null;
}
export function OrientationContent({ block }: { block: OrientationBlock }) {
  return <section className={`orientation-reading-block ${block.pair ? "has-pair" : ""}`}>
    <div className="orientation-reading-copy"><h2>{block.title}</h2><p className="orientation-body">{block.body}</p><div className="orientation-spanish" lang="es"><h3>{block.esTitle}</h3><p>{block.es}</p></div></div>
    <OrientationImages block={block} interactive />
    {block.image === "PRO-5" && <p className="orientation-kit-note">Illustrated kit options vary by service. Car magnet optional.<br /><span lang="es">Las opciones del kit varían según el servicio. Imán para auto opcional.</span></p>}
  </section>;
}
export function OrientationFooter() { return <footer className="orientation-footer">Images are illustrations of the standard.<br /><span lang="es">Las imágenes ilustran el estándar.</span></footer>; }