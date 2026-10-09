import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { Lock, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProSession } from "@/hooks/useProSession";
import { ORIENTATION_SECTIONS, stageNumber } from "@/lib/orientation";

export default function ProOrientation() {
  const { userId, loading } = useProSession();
  const [state, setState] = useState<any>(null);
  useEffect(() => { if (userId) (supabase as any).rpc("pro_orientation_state").then(({ data }: any) => setState(data)); }, [userId]);
  const done = useMemo(() => new Set((state?.progress ?? []).filter((x:any)=>x.completed_at).map((x:any)=>x.section_id)), [state]);
  if (loading) return <main className="min-h-screen bg-background p-6 text-muted-foreground">Loading…</main>;
  if (!userId) return <Navigate to="/pro/login" replace />;
  const have = stageNumber(state?.stage ?? "applied");
  return <main className="min-h-screen bg-background text-foreground">
    <Helmet><title>Pro orientation | TIDY</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <div className="mx-auto max-w-xl px-4 py-6">
      <img src="/orientation/PRO-1.jpg" width={1344} height={768} alt="A Pro greeting a homeowner at the door" className="aspect-video w-full rounded-md object-cover" />
      <div className="mt-6 flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-8 border-primary text-center text-sm font-black">{done.size}<span className="text-[10px] font-semibold text-muted-foreground">of 4</span></div>
        <div><h1 className="text-3xl font-black">Pro orientation</h1><p className="text-sm text-muted-foreground">Orientación para Pros</p><p className="mt-1 text-sm">{done.size} of 4 sections read</p><p className="text-xs text-muted-foreground">{done.size} de 4 secciones leídas</p></div>
      </div>
      <div className="mt-6 space-y-3">{ORIENTATION_SECTIONS.map((s,i)=>{const locked=have<s.min; const complete=done.has(s.id); return locked ?
        <div key={s.id} className="rounded-md border border-border bg-muted p-4 opacity-60"><div className="flex gap-3"><Lock className="h-5 w-5"/><div><h2 className="font-bold">{i+1}. {s.title}</h2><p className="text-sm text-muted-foreground">{s.es}</p><p className="mt-2 text-xs">Unlocks when: {s.unlock}</p><p className="text-xs text-muted-foreground">Se abre cuando: {s.unlockEs}</p></div></div></div> :
        <Link key={s.id} to={`/pro/orientation/${s.id}`} className="flex min-h-20 items-center gap-3 rounded-md border border-border bg-card p-4 hover:border-primary">{complete?<Check className="h-6 w-6 text-primary"/>:<span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i+1}</span>}<div><h2 className="font-bold">{s.title}</h2><p className="text-sm text-muted-foreground">{s.es}</p>{complete&&<><p className="mt-1 text-xs text-primary">Read</p><p className="text-xs text-muted-foreground">Leída</p></>}</div></Link>})}</div>
      <footer className="py-8 text-center text-xs text-muted-foreground">Images are illustrations of the standard.</footer>
    </div>
  </main>;
}
