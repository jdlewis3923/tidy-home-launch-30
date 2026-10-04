import { useEffect, useState } from "react";

export type GoogleReview = {
  id: string | null;
  author: string | null;
  author_photo: string | null;
  rating: number | null;
  relative_time: string | null;
  publish_time: string | null;
  text: string;
  review_uri: string | null;
  neighborhood: string | null;
  service?: "cleaning" | "lawn" | "car_care" | null;
};

export type GoogleListing = {
  available: true;
  source: "google" | "cache" | "manual";
  rating: number;
  total_count: number;
  maps_uri: string;
  reviews: GoogleReview[];
};

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-reviews-public`;
let inflight: Promise<GoogleListing | null> | null = null;

function load(): Promise<GoogleListing | null> {
  if (!inflight) {
    inflight = fetch(URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && d.available && d.reviews?.length && d.maps_uri ? (d as GoogleListing) : null))
      .catch(() => null);
  }
  return inflight;
}

/** Real listing or null. Null means render nothing — never a placeholder. */
export function useGoogleListing() {
  const [data, setData] = useState<GoogleListing | null>(null);
  useEffect(() => {
    let live = true;
    load().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  return data;
}

/** "3 weeks ago" — Google's own wording when present, otherwise computed from the date. */
export function relativeTime(r: GoogleReview, lang: "en" | "es" = "en"): string {
  if (r.relative_time && lang === "en") return r.relative_time;
  if (!r.publish_time) return r.relative_time ?? "";
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const days = Math.round((new Date(r.publish_time).getTime() - Date.now()) / 86_400_000);
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  if (Math.abs(days) < 30) return rtf.format(Math.round(days / 7), "week");
  if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), "month");
  return rtf.format(Math.round(days / 365), "year");
}

/**
 * Verbatim lead excerpt: the first sentence when it is 14 words or fewer,
 * otherwise the first 12 words followed by an ellipsis. Never reworded.
 */
export function leadExcerpt(text: string, max = 14, cut = 12): string {
  const clean = text.trim().replace(/\s+/g, " ");
  const first = clean.match(/^[^.!?]+[.!?]+/)?.[0] ?? clean;
  const words = first.split(" ");
  if (words.length <= max && words.length >= 4) return first;
  const all = clean.split(" ");
  return all.length <= max ? clean : `${all.slice(0, cut).join(" ")}…`;
}

/** "Maria Garcia" -> "Maria G." */
export function shortName(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

const ts = (r: GoogleReview) => (r.publish_time ? new Date(r.publish_time).getTime() : 0);

/** 5 stars first, then matching service, then most recent; rotate among the top tier on reload. */
export function pickReview(reviews: GoogleReview[], services: string[] = []): GoogleReview | null {
  const want = services.map((s) => (s === "detailing" ? "car_care" : s));
  const top = reviews.filter((r) => r.rating === 5 && r.text.trim());
  const pool = top.length ? top : reviews.filter((r) => r.text.trim());
  if (!pool.length) return null;
  const matching = pool.filter((r) => r.service && want.includes(r.service));
  const tier = (matching.length ? matching : pool).sort((a, b) => ts(b) - ts(a));
  return tier[Math.floor(Math.random() * Math.min(tier.length, 3))];
}

/** Strongest review for the home hero: 5 stars, longest substantive text. */
export function rankReviews(reviews: GoogleReview[]): GoogleReview[] {
  return [...reviews]
    .filter((r) => r.text.trim())
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.text.length - a.text.length || ts(b) - ts(a));
}

export const formatRating = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 10) / 10));
