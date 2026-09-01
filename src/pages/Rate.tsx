import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Star } from "lucide-react";
import TidyLogo from "@/components/TidyLogo";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { pushEvent } from "@/lib/tracking";

/**
 * /rate — the post-visit SMS destination ("Rate your visit here: jointidy.co/rate").
 *
 * No login. The visit identifier is optional: ?visit= / ?v= / ?job= / ?id=.
 * If it's missing or unrecognised we still take the rating (generic form).
 * 4-5 stars → Google review prompt. 3 or below → private note to Tidy.
 */
const Rate = () => {
  const { t } = useLanguage();
  const [params] = useSearchParams();

  const identifier = useMemo(
    () =>
      (params.get("visit") ||
        params.get("v") ||
        params.get("job") ||
        params.get("job_id") ||
        params.get("visit_id") ||
        params.get("id") ||
        "").trim(),
    [params],
  );

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);

  const submit = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("submit-visit-rating", {
        body: {
          rating,
          comment,
          identifier,
          lang: document.documentElement.lang === "es" ? "es" : "en",
        },
      });
      if (fnError || !data?.ok) throw new Error(fnError?.message || "failed");
      setGoogleUrl(typeof data.google_review_url === "string" ? data.google_review_url : null);
      setDone(true);
      pushEvent("visit_rating_submitted", {
        rating,
        has_comment: comment.trim().length > 0,
        matched: Boolean(data.matched),
      });
    } catch {
      setError(t("Couldn't save — try again in a moment."));
    } finally {
      setSubmitting(false);
    }
  };

  const shown = hover || rating;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[480px] text-center">
        <div className="inline-block mb-6">
          <TidyLogo size="lg" withBackground />
        </div>

        {!done ? (
          <>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              {t("How did your visit go?")}
            </h1>
            <p className="text-text-mid mb-8">
              {t("Tap a star. It takes a few seconds and it goes straight to your Pro.")}
            </p>

            <div className="flex justify-center gap-2 mb-8" role="group" aria-label={t("Star rating")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  aria-label={`${n} ${t("stars")}`}
                  aria-pressed={rating === n}
                  className="p-1 transition-transform active:scale-95"
                >
                  <Star
                    className={`h-10 w-10 md:h-11 md:w-11 transition-colors ${
                      n <= shown ? "fill-gold text-gold" : "text-border"
                    }`}
                  />
                </button>
              ))}
            </div>

            <label htmlFor="rate-comment" className="sr-only">
              {t("Anything you'd like to add? (optional)")}
            </label>
            <textarea
              id="rate-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t("Anything you'd like to add? (optional)")}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4"
            />

            {error && <p className="text-sm text-destructive mb-4">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={!rating || submitting}
              className="w-full rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition-colors hover:bg-primary-deep disabled:opacity-50"
            >
              {submitting ? t("Sending...") : t("Submit rating")}
            </button>
          </>
        ) : rating >= 4 ? (
          <>
            <div className="text-5xl mb-4">⭐</div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              {t("Thank you — that means a lot.")}
            </h1>
            <p className="text-text-mid mb-8">
              {t("Would you share it on Google? It takes 30 seconds and it helps your Pro directly.")}
            </p>
            {googleUrl && (
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => pushEvent("google_review_click", { rating })}
                className="block w-full rounded-xl bg-gold px-6 py-3.5 font-semibold text-navy transition-transform hover:scale-[1.01] mb-4"
              >
                {t("Leave a Google review")}
              </a>
            )}
            <Link to="/" className="text-sm text-primary hover:text-primary-deep font-medium">
              ← {t("Back to the site")}
            </Link>
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">🙏</div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              {t("Thank you for telling us.")}
            </h1>
            <p className="text-text-mid mb-6">
              {t("This went straight to our team, not to a public review. Someone will follow up with you about making it right.")}
            </p>
            <p className="text-sm text-text-light mb-8">
              {t("Need us sooner? Call")}{" "}
              <a href="tel:+17868291141" className="text-primary underline">
                (786) 829-1141
              </a>{" "}
              {t("or email")}{" "}
              <a href="mailto:hello@jointidy.co" className="text-primary underline">
                hello@jointidy.co
              </a>
            </p>
            <Link to="/" className="text-sm text-primary hover:text-primary-deep font-medium">
              ← {t("Back to the site")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default Rate;
