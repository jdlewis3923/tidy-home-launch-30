import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrientationAccess } from "@/hooks/useOrientationAccess";
import { OrientationSlide, orientationSlides } from "@/components/pro/orientation/OrientationSlide";
import { orientationPdf } from "@/lib/orientation-pdf";
import "@/styles/orientation.css";

export default function ProOrientationPreview() {
  const admin = useLocation().pathname.startsWith("/admin");
  const access = useOrientationAccess(admin);
  const [params, setParams] = useSearchParams();
  const slides = orientationSlides(access.sections);
  const current = Math.max(0, Math.min(slides.length - 1, Number(params.get("slide") || 1) - 1 || 0));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  const [touch, setTouch] = useState<number | null>(null);
  const move = (next: number) => setParams({ slide: String(Math.max(0, Math.min(slides.length - 1, next)) + 1) }, { replace: true });
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.target instanceof HTMLSelectElement) return; if (e.key === "ArrowRight") move(current + 1); if (e.key === "ArrowLeft") move(current - 1); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [current, slides.length]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const makePdf = async (download: boolean) => {
    if (!access.state || !slides.length) return;
    setBusy(true); setMessage("");
    try {
      const { data } = await (await import("@/integrations/supabase/client")).supabase.auth.getUser();
      if (!data.user) throw new Error("Please sign in again. / Vuelve a iniciar sesión.");
      const url = pdfUrl ?? URL.createObjectURL(await orientationPdf(slides));
      setPdfUrl(url);
      if (download) { const a = document.createElement("a"); a.href = url; a.download = "TIDY-Pro-Orientation.pdf"; a.click(); }
      else setShowPdf(true);
    } catch { setMessage("PDF could not be prepared. Please try again. / No se pudo preparar el PDF. Intenta otra vez."); }
    finally { setBusy(false); }
  };
  if (access.loading) return <main className="orientation-app p-8">Loading… / Cargando…</main>;
  if (!access.userId) return <Navigate to="/pro/login" replace />;
  if (admin && !access.isAdmin) return <Navigate to="/pro/orientation" replace />;
  return <main className="orientation-app orientation-preview">
    <Helmet><title>{`${current + 1}/${slides.length} — ${slides[current]?.block.title ?? "Pro orientation"} | TIDY`}</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <header className="orientation-preview-toolbar">
      <Button variant="ghost" asChild><Link to={admin ? "/admin/orientations" : "/pro/orientation"}><ArrowLeft /> Orientation / Orientación</Link></Button>
      <div className="flex flex-wrap gap-2"><Button className="orientation-gold-button" disabled={busy || !slides.length} onClick={() => makePdf(false)}>{busy ? <Loader2 className="animate-spin" /> : <ExternalLink />} Open PDF / Abrir PDF</Button><Button variant="outline" disabled={busy || !slides.length} onClick={() => makePdf(true)}><Download /> PDF</Button></div>
    </header>
    <h1 className="orientation-preview-title">TIDY Pro orientation <span lang="es">Orientación para Pros</span></h1>
    {access.error ? <p role="alert">Orientation unavailable. Try again. / Orientación no disponible. Intenta otra vez.</p> : !slides.length ? <p>Available after your agreement is signed. / Disponible después de firmar tu acuerdo.</p> : <>
      <div className="orientation-preview-stage" onTouchStart={e => setTouch(e.touches[0].clientX)} onTouchEnd={e => { if (touch !== null && Math.abs(e.changedTouches[0].clientX - touch) > 50) move(current + (e.changedTouches[0].clientX < touch ? 1 : -1)); setTouch(null); }}><OrientationSlide slide={slides[current]} page={current + 1} total={slides.length} /></div>
      <nav className="orientation-deck-nav" aria-label="Deck navigation"><Button variant="outline" size="icon" title="Previous / Anterior" aria-label="Previous slide" disabled={current === 0} onClick={() => move(current - 1)}><ChevronLeft /></Button><select aria-label="Choose slide" className="orientation-slide-select" value={current} onChange={e => move(Number(e.target.value))}>{slides.map((s, i) => <option key={`${s.section.id}-${s.index}`} value={i}>{i + 1}. {s.block.title}</option>)}</select><Button variant="outline" size="icon" title="Next / Siguiente" aria-label="Next slide" disabled={current === slides.length - 1} onClick={() => move(current + 1)}><ChevronRight /></Button></nav>
      {!admin && <p className="text-center text-sm text-muted-foreground">{access.sections.length} of 4 sections available / {access.sections.length} de 4 secciones disponibles</p>}
    </>}
    {message && <p role="alert">{message}</p>}
    {showPdf && pdfUrl && <section className="orientation-pdf-panel"><div className="flex flex-wrap justify-between gap-2"><h2>PDF</h2><Button variant="outline" onClick={() => setShowPdf(false)}>Close / Cerrar</Button><Button asChild variant="outline"><a href={pdfUrl} target="_blank" rel="noreferrer">Open in new tab / Abrir en otra pestaña <ExternalLink /></a></Button></div><iframe title="TIDY Pro orientation PDF" src={pdfUrl} /></section>}
  </main>;
}