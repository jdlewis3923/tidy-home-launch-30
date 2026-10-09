import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { Lock, Check, ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import TidyLogo from "@/components/TidyLogo";
import { useOrientationAccess } from "@/hooks/useOrientationAccess";
import { ORIENTATION_SECTIONS, stageNumber } from "@/lib/orientation";
import { OrientationFooter, SECTION_IMAGES } from "@/components/pro/orientation/OrientationContent";
import "@/styles/orientation.css";
import { orientationImage } from "@/lib/orientation-design";

export default function ProOrientation() {
  const { userId, loading, state, error } = useOrientationAccess();
  const done = new Set((state?.progress ?? []).filter(x => x.completed_at).map(x => x.section_id));
  if (loading) return <main className="orientation-app p-6">Loading… / Cargando…</main>;
  if (!userId) return <Navigate to="/pro/login" replace />;
  const have = stageNumber(state?.stage ?? "");
  return <main className="orientation-app">
    <Helmet><title>Pro orientation | TIDY</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <nav className="orientation-topbar"><Link to="/pro/profile" aria-label="TIDY Pro profile"><TidyLogo priority /></Link><span className="orientation-top-label font-bold">PRO ORIENTATION / ORIENTACIÓN</span><Button asChild className="orientation-gold-button"><Link to="/pro/orientation/preview"><Play /> Preview / Vista previa</Link></Button></nav>
    <header className="orientation-hero"><img src={orientationImage("PRO-1")} width={1536} height={1024} alt="Illustration of a Pro greeting a homeowner at the door" /><div className="orientation-hero-copy"><h1>Pro orientation</h1><p className="hero-spanish" lang="es">Orientación para Pros</p><p>Reliable. Respectful. Thorough.</p><p className="hero-spanish" lang="es">Confiable. Respetuoso. Minucioso.</p></div></header>
    <div className="orientation-hub-body">
      <div className="orientation-progress"><div className="orientation-ring" aria-label={`${done.size} of 4 sections read`}><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" /><circle className="ring-filled" cx="50" cy="50" r="42" strokeDasharray={`${done.size / 4 * 264} 264`} /></svg><strong>{done.size}/4</strong></div><div><h2>{done.size} of 4 sections read</h2><p className="mt-2 text-sm text-muted-foreground" lang="es">{done.size} de 4 secciones leídas</p></div></div>
      {error && <p role="alert" className="mb-6 text-destructive">Your orientation could not load. Please refresh. / No se pudo cargar tu orientación. Actualiza la página.</p>}
      <div className="orientation-section-grid">{ORIENTATION_SECTIONS.map((s, i) => { const locked = have < s.min; const complete = done.has(s.id); return <section key={s.id} className={`orientation-section-tile tone-${["blue", "yellow", "white", "charcoal"][i]} ${locked ? "is-locked" : ""}`}><img src={orientationImage(SECTION_IMAGES[i])} width={1344} height={768} loading="lazy" alt={`Illustration for ${s.title}`} /><div className="orientation-tile-copy"><p className="mb-3 text-sm font-extrabold">{String(i + 1).padStart(2, "0")}{complete && <Check className="ml-2 inline h-5 w-5 text-primary" />}</p><h2>{s.title}</h2><p className="text-sm text-muted-foreground" lang="es">{s.es}</p>{locked ? <div className="mt-5"><p className="flex items-center gap-2 text-sm font-bold"><Lock className="h-4 w-4" /> Unlocks when: {s.unlock}</p><p className="text-xs" lang="es">Se abre cuando: {s.unlockEs}</p></div> : <Button asChild variant="outline" className="tile-action"><Link to={`/pro/orientation/${s.id}`}>{complete ? "Read again / Volver a leer" : "Read section / Leer sección"}<ArrowRight /></Link></Button>}</div></section>; })}</div>
    </div><OrientationFooter />
  </main>;
}
