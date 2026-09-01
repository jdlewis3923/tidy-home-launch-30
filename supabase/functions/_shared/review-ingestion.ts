// Tidy — Review ingestion adapters.
//
// Swappable adapter interface: today only Adapter A (manual paste/CSV) is
// implemented. Adapter B (Google Business Profile API) can be added later
// by implementing the same `ReviewAdapter` interface — the import edge
// function and attribution pipeline never need to change.

export interface RawReviewInput {
  reviewer_name: string | null;
  stars: number;
  comment: string | null;
  posted_at: string; // ISO
  external_review_id?: string | null;
}

export interface NormalizedReview extends RawReviewInput {
  source: string;
  external_review_id: string; // always populated after normalization
}

export interface ReviewAdapter {
  source: string;
  /** Parse adapter-specific input into normalized rows (dedupe key populated). */
  normalize(input: unknown[]): NormalizedReview[];
}

/** Deterministic fallback dedupe key when no external_review_id is supplied. */
export function hashFallbackId(reviewerName: string | null, postedAt: string, comment: string | null): string {
  const base = `${(reviewerName ?? '').trim().toLowerCase()}|${postedAt}|${(comment ?? '').trim().slice(0, 60).toLowerCase()}`;
  // Small, dependency-free string hash (djb2) — stable across runs.
  let hash = 5381;
  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) + hash + base.charCodeAt(i)) >>> 0;
  }
  return `hash_${hash.toString(16)}`;
}

/** Adapter A — manual paste / CSV rows pasted into /admin/reviews/import. */
export const manualPasteAdapter: ReviewAdapter = {
  source: 'google_manual',
  normalize(input: unknown[]): NormalizedReview[] {
    const out: NormalizedReview[] = [];
    for (const raw of input) {
      const r = raw as Record<string, unknown>;
      const reviewer_name = typeof r.reviewer_name === 'string' ? r.reviewer_name.trim() : (typeof r.name === 'string' ? r.name.trim() : null);
      const starsNum = Number(r.stars ?? r.rating);
      if (!Number.isFinite(starsNum) || starsNum < 1 || starsNum > 5) continue;
      const stars = Math.round(starsNum);
      const comment = typeof r.comment === 'string' ? r.comment.trim() : (typeof r.text === 'string' ? r.text.trim() : null);
      const dateRaw = (r.posted_at ?? r.date) as string | undefined;
      const parsed = dateRaw ? new Date(dateRaw) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) continue;
      const posted_at = parsed.toISOString();
      const providedId = typeof r.external_review_id === 'string' && r.external_review_id.trim() ? r.external_review_id.trim() : null;
      const external_review_id = providedId ?? hashFallbackId(reviewer_name, posted_at, comment);
      out.push({ source: 'google_manual', reviewer_name, stars, comment, posted_at, external_review_id });
    }
    return out;
  },
};
