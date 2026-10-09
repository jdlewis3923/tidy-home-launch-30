/** /lawn-size/:token — the customer confirms or declines a lawn size-up before anything is charged. */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import TidyLogo from "@/components/TidyLogo";
import { LAWN_SIZE_NAMES, type CanonSize } from "@/lib/pricing-canon";

type Offer = {
  first_name: string; status: string; lawn_measured_sqft: number; lawn_verified_size: string; lawn_selected_size: string | null;
  lawn_old_monthly_cents: number | null; lawn_new_monthly_cents: number | null; lawn_size_confirmation: string;
};
const money = (c: number | null) => (c == null ? "" : `$${Math.round(c / 100).toLocaleString()}`);

export default function LawnSizeConfirm() {
  const { token = "" } = useParams();
  const { t } = useLanguage();
  // ?plan=1 — a size change on an existing paid plan (not a reservation).
  const [params] = useSearchParams();
  const plan = params.get("plan") === "1";
  const fn = plan ? "lawn-plan-change" : "lawn-verification";
  const [offer, setOffer] = useState<Offer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "confirmed" | "declined">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.functions.invoke(fn, { body: { action: "load", token } }).then(({ data }) => {
      if (!data?.ok) { setState("missing"); return; }
      const o = data.offer as Offer;
      setOffer(o);
      setState(o.lawn_size_confirmation === "confirmed" ? "confirmed" : o.lawn_size_confirmation === "declined" ? "declined" : "ready");
    });
  }, [token, fn]);

  async function respond(accept: boolean) {
    setBusy(true);
    const { data } = await supabase.functions.invoke(fn, { body: { action: "respond", token, accept } });
    setBusy(false);
    if (data?.ok) setState(accept ? "confirmed" : "declined");
  }

  const size = offer ? t(LAWN_SIZE_NAMES[Number(offer.lawn_verified_size) as CanonSize] ?? "") : "";
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <Helmet><title>{t("Confirm your lawn size")} | Tidy</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm">
        <TidyLogo size="md" />
        {state === "loading" && <p className="mt-6 text-muted-foreground">{t("Loading…")}</p>}
        {state === "missing" && <p className="mt-6 text-foreground">{t("This link isn't active. Call us at (786) 829-1141.")}</p>}
        {offer && state === "ready" && (
          <>
            <h1 className="mt-6 text-2xl font-black text-foreground">{t("Confirm your lawn size")}</h1>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              {t("We measured your lawn from above at about {sqft} sq ft, which puts it in our {size} size.")
                .replace("{sqft}", offer.lawn_measured_sqft.toLocaleString()).replace("{size}", size)}{" "}
              {(offer.lawn_old_monthly_cents != null
                ? t(plan ? "Your lawn plan is {new} a month instead of {old}." : "Your plan is {new} a month instead of {old}.")
                : t(plan ? "Your lawn plan is {new} a month." : "Your plan is {new} a month.")).replace("{new}", money(offer.lawn_new_monthly_cents)).replace("{old}", money(offer.lawn_old_monthly_cents))}{" "}
              {t("Nothing is charged until you confirm.")}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button disabled={busy} onClick={() => respond(true)} className="min-h-[48px] rounded-xl bg-gold px-4 font-extrabold text-navy disabled:opacity-50">{t("Confirm new size")}</button>
              <button disabled={busy} onClick={() => respond(false)} className="min-h-[48px] rounded-xl border-2 border-border px-4 font-semibold text-foreground disabled:opacity-50">{t(plan ? "Don't change my plan" : "Cancel my reservation")}</button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t(!plan ? "Declining cancels the lawn reservation — we never shrink the visit to fit a smaller price." : (offer as Offer & { kind?: string }).kind === "correction" ? "Declining ends lawn service on your plan — we never shrink the visit to fit a smaller price." : "Declining means lawn isn't added — we never shrink the visit to fit a smaller price.")}</p>
          </>
        )}
        {state === "confirmed" && <p className="mt-6 text-lg font-semibold text-foreground">{t(plan ? "Confirmed. Your lawn plan is updated at the measured size, starting on your next bill." : "Confirmed. Your lawn plan is set at the measured size — we'll be in touch before your first visit.")}</p>}
        {state === "declined" && <p className="mt-6 text-lg font-semibold text-foreground">{t(plan ? "No change made. Nothing was charged." : "Your reservation is cancelled. Nothing was charged.")}</p>}
      </div>
    </main>
  );
}
