import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useOrientationAccess } from "@/hooks/useOrientationAccess";
import { ORIENTATION_COPY, ORIENTATION_SECTIONS, stageNumber } from "@/lib/orientation";
import { OrientationContent, OrientationFooter } from "@/components/pro/orientation/OrientationContent";
import "@/styles/orientation.css";

export default function ProOrientationSection() {
  const { sectionId = "" } = useParams(); const nav = useNavigate();
  const access = useOrientationAccess();
  const section = ORIENTATION_SECTIONS.find(s => s.id === sectionId);
  const unlocked = Boolean(section && access.state && stageNumber(access.state.stage) >= section.min);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  useEffect(() => {
    if (access.userId && section && unlocked) void supabase.rpc("pro_orientation_touch" as never, { _section_id: section.id, _complete: false } as never);
  }, [access.userId, section?.id, unlocked]);
  if (access.loading) return <main className="orientation-app p-6">Loading… / Cargando…</main>;
  if (!access.userId) return <Navigate to="/pro/login" replace />;
  if (!section || !unlocked) return <Navigate to="/pro/orientation" replace />;
  const complete = async () => {
    setBusy(true); setError(false);
    const result = await supabase.rpc("pro_orientation_touch" as never, { _section_id: section.id, _complete: true } as never);
    setBusy(false);
    if (result.error) setError(true); else nav("/pro/orientation");
  };
  return <main className="orientation-app"><Helmet><title>{`${section.title} | TIDY`}</title><meta name="robots" content="noindex,nofollow" /></Helmet><article className="orientation-reading"><nav className="flex flex-wrap justify-between gap-3"><Button asChild variant="ghost"><Link to="/pro/orientation"><ArrowLeft /> All sections / Todas las secciones</Link></Button><Button asChild variant="outline"><Link to="/pro/orientation/preview"><Play /> Preview / Vista previa</Link></Button></nav><header><p className="text-sm font-extrabold text-primary">SECTION {ORIENTATION_SECTIONS.indexOf(section) + 1} / SECCIÓN {ORIENTATION_SECTIONS.indexOf(section) + 1}</p><h1>{section.title}</h1><p className="text-lg text-muted-foreground" lang="es">{section.es}</p></header>{ORIENTATION_COPY[section.id].map((block, i) => <OrientationContent key={i} block={block} />)}<div className="border-t border-border pt-8"><Button className="orientation-gold-button min-h-14 w-full text-base" onClick={complete} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Check />} I've read this / He leído esto</Button>{error && <p role="alert" className="mt-3 text-destructive">Could not save. Please try again. / No se pudo guardar. Intenta otra vez.</p>}</div><OrientationFooter /></article></main>;
}
