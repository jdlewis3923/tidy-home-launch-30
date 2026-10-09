import { ShieldCheck, LockKeyhole, MessageCircle, ArrowUpRight, Check, Clock3, AlertTriangle, MapPin, Camera, Handshake } from "lucide-react";
import TidyLogo from "@/components/TidyLogo";
import { OrientationImages } from "./OrientationContent";
import { orientationSegments, orientationVisual } from "@/lib/orientation-design";
import type { OrientationBlock } from "@/lib/orientation";

export function OrientationComposition({ block, sectionId, index, interactive = true }: { block: OrientationBlock; sectionId: string; index: number; interactive?: boolean }) {
  const v = orientationVisual(block, sectionId, index);
  const en = orientationSegments(block.body), es = orientationSegments(block.es);
  const Copy = () => <div className="orientation-slide-copy"><h1>{block.title}</h1><p>{block.body}</p><div lang="es"><h2>{block.esTitle}</h2><p>{block.es}</p></div></div>;
  const Title = () => <div className="orientation-composition-title"><h1>{block.title}</h1><h2 lang="es">{block.esTitle}</h2></div>;
  const Photo = () => v.image ? <img src={v.image} width={1536} height={1024} alt={block.title} className="orientation-photo" /> : null;
  const Tiles = ({ symbols = false }: { symbols?: boolean }) => <div className="orientation-content-tiles">{en.map((s, i) => <div className="orientation-content-tile" key={s}><span className="orientation-tile-number">{symbols ? <Check /> : String(i + 1).padStart(2, "0")}</span><p>{s}</p>{es[i] && <p lang="es">{es[i]}</p>}</div>)}</div>;
  if (block.pair) return <><Copy /><OrientationImages block={block} eager interactive={interactive} /></>;
  if (v.layout === "opener") return <div className="orientation-opening"><h1>{block.title}</h1><p>{block.body}</p><div lang="es"><h2>{block.esTitle}</h2><p>{block.es}</p></div><span className="orientation-opening-line" aria-hidden="true" /></div>;
  if (v.layout === "badge") return <><Copy /><div className="orientation-badge-stage"><div className="orientation-id-badge"><div className="orientation-id-top"><TidyLogo /><strong>TIDY PRO</strong></div><Photo /><strong className="orientation-id-name">ALEX RIVERA</strong><span className="orientation-id-role">Independent Pro / Pro independiente</span><div className="orientation-id-bottom">SAMPLE / EJEMPLO</div></div></div></>;
  if (v.layout === "kit") return <><Copy /><div className="orientation-kit-stage"><Photo /><p className="orientation-kit-note">Illustrated kit options vary by service. Car magnet optional.<br /><span lang="es">Las opciones del kit varían según el servicio. Imán para auto opcional.</span></p></div></>;
  if (["pillars", "gates", "pay", "timeline", "steps"].includes(v.layout)) return <><Title /><Tiles />{v.layout === "pillars" && <div className="orientation-pillar-photo"><Photo /></div>}</>;
  if (v.layout === "territory") return <><Title /><div className="orientation-zip-grid">{[["33156","Pinecrest"],["33183","Kendall"],["33186","Kendall West"]].map(([zip, label]) => <div key={zip}><MapPin /><strong>{zip}</strong><span>{label}</span></div>)}</div><div className="orientation-wide-copy"><p>{block.body}</p><p lang="es">{block.es}</p></div></>;
  if (v.layout === "stat") return <><div className="orientation-stat-callout"><strong>{v.stat}</strong><Clock3 /></div><Copy /></>;
  if (v.layout === "coverage") return <><Title /><div className="orientation-coverage-numbers"><div><ShieldCheck /><strong>$1M</strong></div><div><ShieldCheck /><strong>$2M</strong></div></div><div className="orientation-wide-copy"><p>{block.body}</p><p lang="es">{block.es}</p></div></>;
  if (v.layout === "quote") return <><Title /><div className="orientation-quote-mark" aria-hidden="true">“</div><div className="orientation-quote-copy"><p>{block.body}</p><p lang="es">{block.es}</p></div></>;
  if (["privacy", "boundary", "message", "scenario-graphic", "alert", "editorial"].includes(v.layout)) {
    const Icon = v.layout === "privacy" ? LockKeyhole : v.layout === "message" ? MessageCircle : v.layout === "alert" ? AlertTriangle : v.layout === "editorial" ? Handshake : ArrowUpRight;
    return <><div className="orientation-symbol-panel"><Icon strokeWidth={1.5} /><span aria-hidden="true">{String(v.number + 1).padStart(2,"0")}</span></div><Copy /></>;
  }
  return <><Copy /><div className="orientation-story-photo"><Photo />{v.layout === "photo-story" && <Camera className="orientation-photo-symbol" />}{v.layout === "finale" && <Check className="orientation-photo-symbol" />}</div></>;
}