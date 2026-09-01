import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Star } from "lucide-react";
import TidyLogo from "@/components/TidyLogo";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { pushEvent } from "@/lib/tracking";

/**
 * /rate — the post-visit SMS destination ("Rate your visit here: jointidy.co/rate").
 *
 * No login. Optional ?job= / ?job_id= and ?customer= / ?customer_id= (plus the
 * legacy ?visit= / ?v= / ?id= aliases) are tolerated but never required.
 *
 * Screen 2 is byte-identical for every star value: the Google review button
 * always renders, full width, same copy. 3 stars or below additionally show
 * a "make it right" panel BELOW the Google button — never instead of it.
 */
const GOOGLE_REVIEW_URL = "https://g.page/r/Cd7-Iz6HobqzEBI/review";

const Rate = () => {
  const { t } = useLanguage();
  const [params] = useSearchParams();

  const jobId = useMemo(
    () =>
      (params.get("job") ||
        params.get("job_id") ||
        params.get("visit") ||
        params.get("v") ||
        params.get("visit_id") ||
        params.get("id") ||
        "").trim(),
    [params],
  );
  const customerId = useMemo(
    () => (params.get("customer") || params.get("customer_id") || "").trim(),
    [params],
  );

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement | null>(null);

  // Screen-2 follow-up ("Let us make it right") state. The screen-1 textarea is
  // unmounted by then, so the panel owns its own field and posts back against
  // the rating row rather than trying to focus a field that no longer exists.
  const [ratingId, setRatingId] = useState<string | null>(null);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [followup, setFollowup] = useState("");
  const [followupSending, setFollowupSending] = useState(false);
  const [followupSent, setFollowupSent] = useState(false);
  const [followupError, setFollowupError] = useState("");
  const followupRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("submit-visit-rating", {
        body: {
          stars: rating,
          comment,
          job_id: jobId || undefined,
          customer_id: customerId || undefined,
          lang: document.documentElement.lang === "es" ? "es" : "en",
        },
      });
      if (fnError || !data?.ok) throw new Error(fnError?.message || "failed");
      setRatingId(typeof data?.rating_id === "string" ? data.rating_id : null);
      setDone(true);
      pushEvent("visit_rating", { stars: rating, has_comment: comment.trim().length > 0 });
    } catch {
      setError(t("Couldn't save — try again in a moment."));
    } finally {
      setSubmitting(false);
    }
  };

  const openFollowup = () => {
    setFollowupOpen(true);
    // Focus after the field actually mounts.
    requestAnimationFrame(() => followupRef.current?.focus());
  };

  const sendFollowup = async () => {
    const note = followup.trim();
    if (!note || followupSending) return;
    setFollowupSending(true);
    setFollowupError("");
    try {
      if (!ratingId) throw new Error("no_rating_id");
      const { data, error: fnError } = await supabase.functions.invoke("submit-visit-rating", {
        body: { rating_id: ratingId, comment: note },
      });
      if (fnError || !data?.ok) throw new Error(fnError?.message || "failed");
      setFollowupSent(true);
      pushEvent("visit_rating_followup", { stars: rating });
    } catch {
      setFollowupError(t("Couldn't send — email us at hello@jointidy.co and we'll fix it."));
    } finally {
      setFollowupSending(false);
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
              {t("How was your visit?")}
            </h1>

            <div className="flex justify-center gap-2 my-8" role="group" aria-label={t("Star rating")}>
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
                    className={`h-11 w-11 md:h-12 md:w-12 transition-colors ${
                      n <= shown ? "fill-gold text-gold" : "text-border"
                    }`}
                  />
                </button>
              ))}
            </div>

            <label htmlFor="rate-comment" className="sr-only">
              {t("Anything you want us to know?")}
            </label>
            <textarea
              ref={commentRef}
              id="rate-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t("Anything you want us to know? (optional)")}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4"
            />

            {error && <p className="text-sm text-destructive mb-4">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={!rating || submitting}
              className="w-full rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition-colors hover:bg-primary-deep disabled:opacity-50"
            >
              {submitting ? t("Sending...") : t("Send")}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              {t("Thanks — that helps.")}
            </h1>

            {/* Always renders, identical for every star value — do not gate this. */}
            <a
              href={GOOGLE_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => pushEvent("google_review_click", { stars: rating })}
              className="block w-full rounded-xl bg-gold px-6 py-3.5 font-semibold text-navy transition-transform hover:scale-[1.01] mt-6 mb-3"
            >
              {t("Leave us a Google review")}
            </a>
            <p className="text-sm text-text-mid mb-8">
              {t("It takes 20 seconds and it's the single biggest thing that helps a small local company.")}
            </p>

            {rating <= 3 && (
              <div className="rounded-xl border border-border bg-card p-5 text-left mb-6">
                <h2 className="text-lg font-bold text-foreground mb-1">
                  {t("Let us make it right.")}
                </h2>
                <p className="text-sm text-text-mid mb-4">
                  {t("Tell us what happened and we'll re-clean the area free, or refund the visit.")}
                </p>
                {followupSent ? (
                  <p className="text-sm font-medium text-foreground">
                    {t("Got it — we'll be in touch to make this right.")}
                  </p>
                ) : followupOpen ? (
                  <>
                    <label htmlFor="rate-followup" className="sr-only">
                      {t("Tell us what happened")}
                    </label>
                    <textarea
                      ref={followupRef}
                      id="rate-followup"
                      value={followup}
                      onChange={(e) => setFollowup(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      placeholder={t("What went wrong? (we read every one of these)")}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-primary/40 mb-3"
                    />
                    {followupError && (
                      <p className="text-sm text-destructive mb-3">{followupError}</p>
                    )}
                    <button
                      type="button"
                      onClick={sendFollowup}
                      disabled={!followup.trim() || followupSending}
                      className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-deep disabled:opacity-50 mb-2"
                    >
                      {followupSending ? t("Sending...") : t("Send this to us")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={openFollowup}
                    className="w-full rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors mb-2"
                  >
                    {t("Tell us what happened")}
                  </button>
                )}
                <a
                  href="mailto:hello@jointidy.co"
                  className="block text-center text-sm text-text-light underline hover:text-text-mid"
                >
                  {t("Or email hello@jointidy.co")}
                </a>
              </div>
            )}

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
