// Tidy — public add-on approval page (/addon/:token).
//
// Opened straight from an SMS on a phone with no session, so the token in the
// URL is the only credential. One decision, two buttons, the photo the Pro
// took, and the real price. No account, no upsell, no dark patterns.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Check, X, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { pushEvent } from "@/lib/tracking";

type AddonRequest = {
  addon_name: string;
  condition_note: string | null;
  amount_cents: number;
  minutes_estimate: number;
  status: "pending" | "approved" | "declined" | "expired" | "needs_quote";
  expires_at: string;
  photo_url: string | null;
  pro_first_name: string;
};

const FN = "addon-request-respond";

export default function AddonApproval() {
  const { token = "" } = useParams();
  const { language } = useLanguage();
  const es = language === "es";

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<AddonRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"approve" | "decline" | null>(null);
  const [result, setResult] = useState<"approved" | "declined" | null>(null);

  useEffect(() => {
    document.title = es ? "Aprobar servicio adicional | Tidy" : "Approve an add-on | Tidy";
    let active = true;
    (async () => {
      const { data, error: err } = await supabase.functions.invoke(
        `${FN}?token=${encodeURIComponent(token)}`,
        { method: "GET" },
      );
      if (!active) return;
      if (err || !data?.ok) {
        setError(es ? "No encontramos esta solicitud." : "We couldn't find this request.");
      } else {
        setRequest(data.request as AddonRequest);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [token, es]);

  const respond = async (action: "approve" | "decline") => {
    setSubmitting(action);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke(FN, {
      body: { token, action },
    });
    setSubmitting(null);
    if (err || !data?.ok) {
      const code = (data as { error?: string } | null)?.error;
      if (code === "expired") {
        setRequest((r) => (r ? { ...r, status: "expired" } : r));
        return;
      }
      if (code === "payment_failed") {
        setError(es
          ? "Tu tarjeta fue rechazada. No cobramos nada. Llámanos al (786) 829-1141."
          : "Your card was declined. Nothing was charged. Call us at (786) 829-1141.");
        return;
      }
      setError(es ? "Algo falló. Intenta de nuevo." : "Something went wrong. Try again.");
      return;
    }
    setResult(action === "approve" ? "approved" : "declined");
    pushEvent(action === "approve" ? "addon_approved" : "addon_declined", {
      addon_name: request?.addon_name,
      value: action === "approve" ? (request?.amount_cents ?? 0) / 100 : undefined,
    });
  };

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </main>
  );

  if (loading) {
    return shell(
      <div className="flex justify-center pt-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>,
    );
  }

  if (!request) {
    return shell(
      <p className="pt-16 text-center text-muted-foreground">
        {error ?? (es ? "Solicitud no encontrada." : "Request not found.")}
      </p>,
    );
  }

  const dollars = Math.round(request.amount_cents / 100);
  const settled = result ?? (request.status !== "pending" ? request.status : null);

  if (settled === "approved") {
    return shell(
      <div className="rounded-2xl border border-border bg-card p-7 text-center">
        <Check className="mx-auto mb-3 h-10 w-10 text-primary" aria-hidden />
        <h1 className="text-xl font-semibold text-foreground">
          {es ? "Aprobado" : "Approved"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {es
            ? `${request.pro_first_name} lo está haciendo ahora. Cobramos $${dollars} a tu tarjeta.`
            : `${request.pro_first_name} is doing it now. We charged $${dollars} to your card.`}
        </p>
      </div>,
    );
  }

  if (settled === "declined" || settled === "expired") {
    return shell(
      <div className="rounded-2xl border border-border bg-card p-7 text-center">
        {settled === "expired"
          ? <Clock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
          : <X className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden />}
        <h1 className="text-xl font-semibold text-foreground">
          {settled === "expired"
            ? (es ? "Se pasó el tiempo" : "That window closed")
            : (es ? "Rechazado" : "Declined")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {es
            ? "No cobramos nada. Hacemos el servicio que ya reservaste."
            : "Nothing was charged. We're doing the service you already booked."}
        </p>
      </div>,
    );
  }

  return shell(
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-semibold leading-snug text-foreground">
        {es
          ? `${request.pro_first_name} encontró algo`
          : `${request.pro_first_name} found something`}
      </h1>

      {request.photo_url && (
        <img
          src={request.photo_url}
          alt={es ? "Foto de la condición encontrada" : "Photo of the condition found"}
          className="mt-4 w-full rounded-xl border border-border object-cover"
          loading="lazy"
        />
      )}

      {request.condition_note && (
        <p className="mt-4 text-[15px] leading-relaxed text-foreground">
          “{request.condition_note}”
        </p>
      )}

      <dl className="mt-5 space-y-2 rounded-xl bg-muted/50 p-4 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{es ? "Servicio" : "Add-on"}</dt>
          <dd className="font-medium text-foreground">{request.addon_name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{es ? "Precio" : "Price"}</dt>
          <dd className="font-semibold text-foreground">${dollars}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{es ? "Tiempo extra" : "Extra time"}</dt>
          <dd className="font-medium text-foreground">
            ~{request.minutes_estimate} {es ? "min" : "min"}
          </dd>
        </div>
      </dl>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={() => respond("approve")}
          disabled={submitting !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting === "approve" && <Loader2 className="h-4 w-4 animate-spin" />}
          {es ? `Aprobar — $${dollars}` : `Approve — $${dollars}`}
        </button>
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={submitting !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-5 py-4 text-base font-medium text-foreground disabled:opacity-60"
        >
          {submitting === "decline" && <Loader2 className="h-4 w-4 animate-spin" />}
          {es ? "No, gracias" : "No thanks"}
        </button>
      </div>

      <p className="mt-4 text-center text-[13px] text-muted-foreground">
        {es
          ? "Si no respondes en 15 minutos, hacemos solo lo que ya reservaste."
          : "No response in 15 minutes and we simply do what you already booked."}
      </p>
    </div>,
  );
}
