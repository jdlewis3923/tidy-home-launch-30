/**
 * Badge photo upload — public routes /photo/:token (and legacy /badge/:token).
 * Rules shown as a green Do list and red Don't list, English then Spanish.
 * JPG, PNG or HEIC up to 15 MB; badge-shaped preview with Retake before sending.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, Check, CheckCircle2, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TidyLogo from "@/components/TidyLogo";
import { PHOTO_DO, PHOTO_DONT, PHOTO_ORIGINAL, PHOTO_PURPOSE, RETAKE_REASONS } from "@/lib/photoRules";

const NAVY = "#0A2A47";
const YELLOW = "#FCCC00";
const SUPPORT_EMAIL = "hello@jointidy.co";
const MAX = 15 * 1024 * 1024;

export function PhotoRules() {
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="font-black text-green-700">Do / Sí</p>
        <ul className="mt-2 space-y-1.5">
          {PHOTO_DO.map(([en, es]) => (
            <li key={en} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
              <span className="text-slate-800">{en}<br /><span className="text-slate-500">{es}</span></span></li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="font-black text-red-700">Don't / No</p>
        <ul className="mt-2 space-y-1.5">
          {PHOTO_DONT.map(([en, es]) => (
            <li key={en} className="flex gap-2"><X className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <span className="text-slate-800">{en}<br /><span className="text-slate-500">{es}</span></span></li>
          ))}
        </ul>
      </div>
      <p className="font-semibold text-slate-800">{PHOTO_ORIGINAL[0]}<br /><span className="font-normal text-slate-500">{PHOTO_ORIGINAL[1]}</span></p>
      <p className="text-slate-600">{PHOTO_PURPOSE[0]}<br /><span className="text-slate-500">{PHOTO_PURPOSE[1]}</span></p>
    </div>
  );
}

export default function BadgePhoto() {
  const { token = "" } = useParams();
  const [state, setState] = useState<"loading" | "open" | "uploaded" | "approved" | "not_found">("loading");
  const [badgeName, setBadgeName] = useState("");
  const [retakeReason, setRetakeReason] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase.rpc("badge_photo_load", { _token: token });
      const res = (data ?? {}) as { state?: string; badge_name?: string; retake_reason?: string };
      if (err || !res.state || res.state === "not_found") return setState("not_found");
      setBadgeName(res.badge_name ?? "");
      setRetakeReason(res.retake_reason ?? null);
      setState(res.state === "approved" ? "approved" : res.state === "uploaded" ? "uploaded" : "open");
    })();
  }, [token]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (f: File) => {
    setError("");
    if (f.size > MAX) return setError("That photo is larger than 15 MB. / Esa foto pesa más de 15 MB.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const type = file.type || (/\.hei[cf]$/i.test(file.name) ? "image/heic" : "image/jpeg");
    const { data, error: err } = await supabase.functions.invoke("badge-photo-upload", {
      body: { token, filename: file.name, content_type: type, data_base64: btoa(binary) },
    });
    setBusy(false);
    if (err || !(data as { ok?: boolean })?.ok) {
      setError("That did not go through. Please try again. / No se pudo enviar. Intente de nuevo.");
      return;
    }
    setState("uploaded");
  };

  const reason = RETAKE_REASONS.find((r) => r.key === retakeReason);
  const canPreview = file && !/hei[cf]/i.test(file.type + file.name);

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
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
          )}
          {state === "not_found" && (
            <div className="py-6 text-center">
              <AlertTriangle className="mx-auto h-10 w-10" style={{ color: NAVY }} />
              <h1 className="mt-4 text-2xl font-black" style={{ color: NAVY }}>This link is no longer active</h1>
              <p className="mt-2 text-slate-600">Este enlace ya no está activo.</p>
              <p className="mt-3 text-sm text-slate-600">Write to <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
            </div>
          )}
          {(state === "uploaded" || state === "approved") && (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${YELLOW}33` }}>
                <CheckCircle2 className="h-8 w-8" style={{ color: NAVY }} />
              </div>
              <h1 className="mt-4 text-2xl font-black" style={{ color: NAVY }}>{state === "approved" ? "Photo approved" : "Photo received"}</h1>
              <p className="mt-2 text-slate-600">{state === "approved" ? "Foto aprobada." : "Foto recibida."}</p>
              <p className="mt-3 text-sm text-slate-600">
                {state === "approved" ? "Your badge is made from this photo." : "Justin reviews it and emails you if another one is needed."}<br />
                <span className="text-slate-500">{state === "approved" ? "Su credencial se hace con esta foto." : "Justin la revisa y le escribe si necesita otra."}</span>
              </p>
            </div>
          )}
          {state === "open" && (
            <>
              <h1 className="text-2xl font-black" style={{ color: NAVY }}>Your badge photo</h1>
              <p className="mt-1 text-slate-600">Su foto para la credencial</p>
              {reason && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                  We need one more photo: {reason.en.toLowerCase()}.<br /><span className="font-normal">Necesitamos otra foto: {reason.es.toLowerCase()}.</span>
                </p>
              )}
              {badgeName && <p className="mt-3 text-sm text-slate-500">Badge name / Nombre: <strong className="text-slate-900">{badgeName}</strong></p>}
              <div className="mt-4"><PhotoRules /></div>

              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }} />

              {file ? (
                <div className="mt-5 flex flex-col items-center">
                  <div className="w-44 overflow-hidden rounded-2xl border-4 bg-slate-100 shadow" style={{ borderColor: NAVY, aspectRatio: "3 / 4" }}>
                    {canPreview ? <img src={preview!} alt="Your photo preview" className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center p-3 text-center text-xs text-slate-500">HEIC photo ready<br />Foto HEIC lista</div>}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">This is how it sits on the badge. / Así queda en la credencial.</p>
                  <div className="mt-4 grid w-full grid-cols-2 gap-2">
                    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">
                      <RotateCcw className="h-4 w-4" /> Retake / Otra
                    </button>
                    <button type="button" disabled={busy} onClick={submit}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-black disabled:opacity-60" style={{ background: YELLOW, color: NAVY }}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {busy ? "Sending…" : "Send / Enviar"}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black" style={{ background: YELLOW, color: NAVY }}>
                  <Upload className="h-4 w-4" /> Take or choose your photo / Tomar o elegir su foto
                </button>
              )}
              <p className="mt-2 text-center text-xs text-slate-500">JPG, PNG or HEIC · up to 15 MB</p>
              {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
            </>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-white/60">Tidy Home Concierge LLC · {SUPPORT_EMAIL}</p>
      </div>
    </main>
  );
}
