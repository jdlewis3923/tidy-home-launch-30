import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import TidyLogo from "@/components/TidyLogo";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

/** /go/:id — one-tap link from the review / referral ask texts. */
export default function GoAsk() {
  const { id } = useParams();
  const { t } = useLanguage();
  const [share, setShare] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void supabase.functions.invoke("member-ask-go", { body: { id } }).then(({ data }) => {
      if (data?.kind === "review" && data.url) window.location.replace(data.url);
      else if (data?.kind === "referral" && data.share_url) setShare(data.share_url);
      else setFailed(true);
    });
  }, [id]);

  const doShare = async () => {
    if (!share) return;
    const text = t("Tidy takes care of my home — cleaning, lawn and car. Use my link and we both get $50:");
    if (navigator.share) { await navigator.share({ title: "Tidy", text, url: share }).catch(() => null); return; }
    await navigator.clipboard.writeText(`${text} ${share}`); setCopied(true);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px] text-center">
        <div className="inline-block mb-6"><TidyLogo size="lg" withBackground /></div>
        {failed && <p className="text-sm text-text-mid">{t("This link isn't valid. Email hello@jointidy.co and we'll help.")}</p>}
        {!failed && !share && <p className="text-sm text-text-light">{t("Loading...")}</p>}
        {share && (
          <>
            <h1 className="text-2xl font-bold text-foreground mb-2">{t("Give $50, get $50")}</h1>
            <p className="text-sm text-text-mid mb-6">{t("Share your link. When a neighbor joins, you both get $50.")}</p>
            <button type="button" onClick={doShare} className="w-full rounded-xl bg-gold px-6 py-3.5 font-semibold text-navy">
              {copied ? t("Link copied") : t("Share my link")}
            </button>
            <p className="mt-3 break-all text-xs text-text-light">{share}</p>
          </>
        )}
      </div>
    </div>
  );
}
