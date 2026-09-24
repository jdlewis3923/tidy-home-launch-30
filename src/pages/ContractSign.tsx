/**
 * Contract signing — public /contract/:token. Independent Contractor Agreement
 * from the Documents Library, typed full legal name + agree tick + Sign.
 * English above Spanish.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, CheckCircle2, Download, Loader2, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TidyLogo from "@/components/TidyLogo";

const NAVY = "#0A2A47";
const YELLOW = "#FCCC00";
const SUPPORT_EMAIL = "hello@jointidy.co";

export default function ContractSign() {
  const { token = "" } = useParams();
  const [state, setState] = useState<"loading" | "open" | "signed" | "not_found">("loading");
  const [first, setFirst] = useState("");
  const [doc, setDoc] = useState<{ url: string | null; version: string } | null>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("contract_load", { _token: token });
      const res = (data ?? {}) as { state?: string; first_name?: string };
      if (!res.state || res.state === "not_found") return setState("not_found");
      setFirst(res.first_name ?? "");
      if (res.state === "signed") return setState("signed");
      const { data: d } = await supabase.functions.invoke("contract-sign", { body: { token, action: "document" } });
      const r = (d ?? {}) as { url?: string; version?: string };
      if (!r.version) return setState("not_found");
      setDoc({ url: r.url ?? null, version: r.version });
      setState("open");
    })();
  }, [token]);

  const sign = async () => {
    setError("");
    const typed = name.trim();
    if (!/\S+\s+\S+/.test(typed)) return setError("Type your full legal name, first and last. / Escriba su nombre legal completo.");
    if (!agreed) return setError("Tick the box to agree. / Marque la casilla para aceptar.");
    setBusy(true);
    const { data, error: err } = await supabase.functions.invoke("contract-sign", {
      body: { token, action: "sign", typed_name: typed, agreed: true, version: doc?.version },
    });
    setBusy(false);
    if (err || !(data as { ok?: boolean })?.ok) {
      setError("That did not go through. Please try again. / No se pudo firmar. Intente de nuevo.");
      return;
    }
    setState("signed");
  };

  return (
    <main className="min-h-screen px-4 py-8" style={{ background: NAVY }}>
      <Helmet>
        <title>Contractor agreement | Tidy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-5 flex justify-center"><TidyLogo size="sm" /></div>
        <div className="rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
          {state === "loading" && <div className="flex items-center justify-center gap-2 py-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>}
          {state === "not_found" && (
            <div className="py-6 text-center">
              <AlertTriangle className="mx-auto h-10 w-10" style={{ color: NAVY }} />
              <h1 className="mt-4 text-2xl font-black" style={{ color: NAVY }}>This link is no longer active</h1>
              <p className="mt-2 text-slate-600">Este enlace ya no está activo.</p>
              <p className="mt-3 text-sm text-slate-600">Write to <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
            </div>
          )}
          {state === "signed" && (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${YELLOW}33` }}>
                <CheckCircle2 className="h-8 w-8" style={{ color: NAVY }} />
              </div>
              <h1 className="mt-4 text-2xl font-black" style={{ color: NAVY }}>Agreement signed{first ? `, ${first}` : ""}</h1>
              <p className="mt-2 text-slate-600">Contrato firmado.</p>
              <p className="mt-3 text-sm text-slate-600">A signed copy is in your email.<br /><span className="text-slate-500">Tiene una copia firmada en su correo.</span></p>
            </div>
          )}
          {state === "open" && doc && (
            <>
              <h1 className="text-2xl font-black" style={{ color: NAVY }}>Independent Contractor Agreement</h1>
              <p className="mt-1 text-slate-600">Contrato de Contratista Independiente</p>
              <p className="mt-3 text-sm text-slate-600">
                Read it through, then sign at the bottom. You are an independent contractor, not an employee.<br />
                <span className="text-slate-500">Léalo completo y firme al final. Usted es contratista independiente, no empleado.</span>
              </p>
              {doc.url ? (
                <>
                  <iframe title="Independent Contractor Agreement" src={doc.url} className="mt-4 h-[60vh] w-full rounded-xl border border-slate-200" />
                  <a href={doc.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 underline">
                    <Download className="h-4 w-4" /> Download the agreement / Descargar el contrato
                  </a>
                </>
              ) : <p className="mt-4 text-sm text-red-600">The agreement could not load. Write to {SUPPORT_EMAIL}.</p>}
              <p className="mt-1 text-xs text-slate-400">Version / Versión: {doc.version}</p>

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="block text-sm font-bold text-slate-800" htmlFor="legal-name">
                  Your full legal name <span className="font-normal text-slate-500">/ Su nombre legal completo</span>
                </label>
                <input id="legal-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name"
                  className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-lg" placeholder="First Last" />
                <label className="mt-4 flex items-start gap-3 text-sm text-slate-800">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-5 w-5" />
                  <span>I have read and agree to this agreement.<br /><span className="text-slate-500">He leído y acepto este contrato.</span></span>
                </label>
                <button type="button" onClick={sign} disabled={busy}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black disabled:opacity-60" style={{ background: YELLOW, color: NAVY }}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} {busy ? "Signing…" : "Sign / Firmar"}
                </button>
                <p className="mt-2 text-xs text-slate-500">We record your typed name, the time, your IP address and browser with the signature. / Guardamos su nombre, la hora, su IP y navegador con la firma.</p>
                {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
              </div>
            </>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-white/60">Tidy Home Concierge LLC · {SUPPORT_EMAIL}</p>
      </div>
    </main>
  );
}
