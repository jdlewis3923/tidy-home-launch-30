import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TidyLogo from "@/components/TidyLogo";
import RedoButton from "@/components/dashboard/RedoButton";
import { useLanguage } from "@/contexts/LanguageContext";

/** /redo?t=<rate_token> — the "Something wasn't right" link in the post-visit email. No login. */
export default function Redo() {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  const token = (params.get("t") ?? "").trim();
  const [info, setInfo] = useState<{ ok: boolean; first_name?: string; completed_at?: string; window_open?: boolean; existing?: unknown } | null>(null);

  useEffect(() => {
    if (!token) { setInfo({ ok: false }); return; }
    const base = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${base}/functions/v1/redo-request?t=${encodeURIComponent(token)}`, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then((r) => r.json()).then(setInfo).catch(() => setInfo({ ok: false }));
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[440px] text-center">
        <div className="inline-block mb-6"><TidyLogo size="lg" withBackground /></div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{t("Something wasn't right?")}</h1>
        <p className="text-sm text-text-mid mb-6">{t("Tell us within 48 hours and we'll send your pro back to fix it at no charge.")}</p>
        {!info && <p className="text-sm text-text-light">{t("Loading...")}</p>}
        {info && !info.ok && <p className="text-sm text-text-mid">{t("This link isn't valid. Email hello@jointidy.co and we'll help.")}</p>}
        {info?.ok && (info.existing
          ? <p className="text-sm text-foreground" data-testid="redo-sent">{t("We already have this one — we're on it.")}</p>
          : info.window_open
            ? <RedoButton token={token} className="text-left" />
            : <p className="text-sm text-text-mid">{t("The 48-hour window for this visit has closed. Email hello@jointidy.co and we'll help.")}</p>)}
        <Link to="/" className="mt-8 inline-block text-sm text-primary font-medium">← {t("Back to the site")}</Link>
      </div>
    </div>
  );
}
