/**
 * Badge photo upload — public route /badge/:token
 *
 * The token lives on the pro_kit row (badge_photo_token) and is reached only
 * through the badge_photo_load RPC and the badge-photo-upload edge function.
 * No login, no table access. Bilingual, English above Spanish.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TidyLogo from "@/components/TidyLogo";

const NAVY = "#0A2A47";
const YELLOW = "#FCCC00";
const SUPPORT_EMAIL = "hello@jointidy.co";

export default function BadgePhoto() {
  const { token = "" } = useParams();
  const [state, setState] = useState<"loading" | "open" | "uploaded" | "not_found">("loading");
  const [badgeName, setBadgeName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase.rpc("badge_photo_load", { _token: token });
      const res = (data ?? {}) as { state?: string; badge_name?: string };
      if (err || !res.state || res.state === "not_found") return setState("not_found");
      setBadgeName(res.badge_name ?? "");
      setState(res.state === "uploaded" ? "uploaded" : "open");
    })();
  }, [token]);

  const upload = async (file: File) => {
    setError("");
    if (file.size > 8 * 1024 * 1024) {
      setError("That photo is larger than 8 MB. / Esa foto pesa más de 8 MB.");
      return;
    }
    setBusy(true);
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const { data, error: err } = await supabase.functions.invoke("badge-photo-upload", {
      body: { token, filename: file.name, content_type: file.type, data_base64: btoa(binary) },
    });
    setBusy(false);
    const res = (data ?? {}) as { ok?: boolean; error?: string };
    if (err || !res.ok) {
      setError("That did not go through. Please try again. / No se pudo enviar. Intente de nuevo.");
      return;
    }
    setState("uploaded");
  };

  return (
    <main className="min-h-screen px-4 py-8" style={{ background: NAVY }}>
      <Helmet>
        <title>Badge photo | Tidy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 flex justify-center"><TidyLogo size="sm" /></div>
        <div className="rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
          {state === "loading" && (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          )}

          {state === "not_found" && (
            <div className="py-6 text-center">
              <AlertTriangle className="mx-auto h-10 w-10" style={{ color: NAVY }} />
              <h1 className="mt-4 text-2xl font-black tracking-tight" style={{ color: NAVY }}>
                This link is no longer active
              </h1>
              <p className="mt-2 text-slate-600">Este enlace ya no está activo.</p>
              <p className="mt-3 text-sm text-slate-600">
                Write to <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              </p>
            </div>
          )}

          {state === "uploaded" && (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${YELLOW}33` }}>
                <CheckCircle2 className="h-8 w-8" style={{ color: NAVY }} />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight" style={{ color: NAVY }}>Photo received</h1>
              <p className="mt-2 text-slate-600">Foto recibida.</p>
              <p className="mt-3 text-sm text-slate-600">
                Your badge is made from this photo. Nothing else to do.<br />
                <span className="text-slate-500">Su credencial se hace con esta foto. No hay nada más que hacer.</span>
              </p>
            </div>
          )}

          {state === "open" && (
            <>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: NAVY }}>
                Your badge photo
              </h1>
              <p className="mt-1 text-slate-600">Su foto para la credencial</p>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p>
                  A clear head-and-shoulders photo, in your Tidy shirt, plain background, no hat or
                  sunglasses. If your shirts have not arrived yet, send the photo once they do.
                </p>
                <p className="mt-2 text-slate-600">
                  Una foto clara de cabeza y hombros, con su camisa de Tidy, fondo sencillo, sin
                  gorra ni gafas de sol. Si sus camisas aún no han llegado, envíe la foto cuando lleguen.
                </p>
              </div>
              {badgeName && (
                <p className="mt-3 text-sm text-slate-500">
                  Badge name / Nombre en la credencial: <strong className="text-slate-900">{badgeName}</strong>
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black disabled:opacity-60"
                style={{ background: YELLOW, color: NAVY }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {busy ? "Sending…" : "Choose your photo / Elegir su foto"}
              </button>
              {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
            </>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-white/60">Tidy Home Concierge LLC · {SUPPORT_EMAIL}</p>
      </div>
    </main>
  );
}
