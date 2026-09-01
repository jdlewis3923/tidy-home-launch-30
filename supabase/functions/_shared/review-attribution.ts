// Tidy — Review-to-Pro attribution engine.
//
// Run at import time for every incoming review. Candidate set = jobs
// (pro_visits) completed 0-14 days before the review's posted_at, for a Pro
// with an active service ZIP (out_of_service_area = false). Scoring per the
// spec in the review-bonus program brief; NEVER auto-approves a bonus — high
// confidence only auto-populates matched_pro_id and sets status 'matched'.
//
// Note: reviews do not carry the reviewer's ZIP (Google reviews expose no
// geo data), so the "serviced ZIP" gate is enforced as "the candidate Pro
// currently services an active ZIP" rather than an exact reviewer-ZIP match.

import { isDiminutiveMatch } from './diminutives.ts';

export interface AttributionCandidate {
  pro_id: string; // applicants.id
  contractor_id: string;
  pro_first_name: string;
  pro_last_name: string;
  visit_id: string;
  customer_name: string | null;
  completed_at: string;
  customer_rating: number | null;
}

export interface ScoredCandidate {
  pro_id: string;
  visit_id: string;
  score: number;
  reasons: string[];
}

export interface AttributionResult {
  matched_pro_id: string | null;
  matched_job_id: string | null;
  match_confidence: 'high' | 'medium' | 'low' | 'none';
  match_score: number | null;
  match_debug: Record<string, unknown>;
}

function firstToken(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}
function lastInitial(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  return last.charAt(0).toLowerCase();
}

export function scoreCandidate(
  reviewerName: string | null,
  reviewComment: string | null,
  postedAt: string,
  candidate: AttributionCandidate,
): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  const reviewerFirst = firstToken(reviewerName).toLowerCase();
  const customerFirst = firstToken(candidate.customer_name).toLowerCase();

  if (reviewerFirst && customerFirst && reviewerFirst === customerFirst) {
    score += 50;
    reasons.push('first_name_exact(+50)');
  } else if (reviewerFirst && customerFirst && isDiminutiveMatch(reviewerFirst, customerFirst)) {
    score += 25;
    reasons.push('first_name_diminutive(+25)');
  }

  const reviewerLastInit = lastInitial(reviewerName);
  const customerLastInit = lastInitial(candidate.customer_name);
  if (reviewerLastInit && customerLastInit && reviewerLastInit === customerLastInit) {
    score += 20;
    reasons.push('last_initial(+20)');
  }

  const completedMs = new Date(candidate.completed_at).getTime();
  const postedMs = new Date(postedAt).getTime();
  const hoursDiff = Math.abs(postedMs - completedMs) / 3_600_000;
  if (hoursDiff <= 72) {
    score += 15;
    reasons.push('within_72h(+15)');
  }

  if (candidate.customer_rating === 5) {
    score += 10;
    reasons.push('visit_rated_5(+10)');
  }

  const proFirst = (candidate.pro_first_name ?? '').trim().toLowerCase();
  if (proFirst && reviewComment && reviewComment.toLowerCase().includes(proFirst)) {
    score += 30;
    reasons.push('text_mentions_pro_first_name(+30)');
  }

  return { pro_id: candidate.pro_id, visit_id: candidate.visit_id, score, reasons };
}

export function attribute(
  reviewerName: string | null,
  reviewComment: string | null,
  postedAt: string,
  candidates: AttributionCandidate[],
): AttributionResult {
  if (candidates.length === 0) {
    return { matched_pro_id: null, matched_job_id: null, match_confidence: 'none', match_score: null, match_debug: { candidate_count: 0 } };
  }

  const scored = candidates
    .map((c) => scoreCandidate(reviewerName, reviewComment, postedAt, c))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const runnerUp = scored[1];
  const margin = runnerUp ? top.score - runnerUp.score : top.score;

  let confidence: AttributionResult['match_confidence'] = 'none';
  if (top.score >= 75 && margin >= 25) confidence = 'high';
  else if (top.score >= 50) confidence = 'medium';
  else if (top.score > 0) confidence = 'low';

  const debug = {
    candidate_count: candidates.length,
    top_score: top.score,
    runner_up_score: runnerUp?.score ?? null,
    margin,
    scored: scored.slice(0, 5).map((s) => ({ pro_id: s.pro_id, visit_id: s.visit_id, score: s.score, reasons: s.reasons })),
  };

  const autoPopulate = confidence === 'high';
  return {
    matched_pro_id: autoPopulate ? top.pro_id : null,
    matched_job_id: autoPopulate ? top.visit_id : null,
    match_confidence: confidence,
    match_score: top.score,
    match_debug: debug,
  };
}
