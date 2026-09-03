/**
 * Tiny fuzzy scorer used by the admin global search.
 *
 * Ordered-subsequence matching (not LIKE): every query character must appear
 * in order, but gaps are allowed, so "walk" hits "The Walkaround", "revew"
 * still hits "review", and "pressur" hits "pressure washer".
 *
 * Score rewards contiguous runs, word-boundary starts, and early matches.
 */

export type FuzzyHit = {
  score: number;
  /** Indices in `text` that matched, in order. */
  indices: number[];
};

/** Best-effort greedy subsequence match with lookahead for a tighter run. */
export function fuzzyMatch(query: string, text: string): FuzzyHit | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();
  if (!t) return null;

  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let prevIdx = -2;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === " ") continue;
    let found = -1;
    // Prefer a hit that sits right after the previous one (contiguous run),
    // otherwise take the next occurrence.
    if (t[ti] === ch) found = ti;
    else found = t.indexOf(ch, ti);
    if (found === -1) return null;

    // Bonuses
    if (found === prevIdx + 1) score += 8;              // contiguous
    const prevChar = found > 0 ? t[found - 1] : " ";
    if (/[\s\-_/.,(]/.test(prevChar)) score += 6;        // word boundary
    if (found === 0) score += 10;                        // prefix
    score += Math.max(0, 6 - Math.floor(found / 24));    // earliness

    indices.push(found);
    prevIdx = found;
    ti = found + 1;
  }

  // Penalise very loose matches spread across a long span.
  const span = indices[indices.length - 1] - indices[0] + 1;
  score -= Math.min(30, Math.floor((span - q.length) / 6));
  return { score, indices };
}

/**
 * Score an item by its title (weighted) and body, returning the better hit
 * plus which field it came from so callers can build a snippet.
 */
export function fuzzyScoreItem(
  query: string,
  title: string,
  body: string,
): { score: number; field: "title" | "body"; indices: number[] } | null {
  const inTitle = fuzzyMatch(query, title);
  const inBody = fuzzyMatch(query, body);
  const titleScore = inTitle ? inTitle.score * 2.2 + 40 : -Infinity;
  const bodyScore = inBody ? inBody.score : -Infinity;
  if (titleScore === -Infinity && bodyScore === -Infinity) return null;
  if (titleScore >= bodyScore) {
    return { score: titleScore, field: "title", indices: inTitle!.indices };
  }
  return { score: bodyScore, field: "body", indices: inBody!.indices };
}

export type SnippetPart = { text: string; hit: boolean };

/**
 * Build a one-line snippet centred on the match with the matched characters
 * flagged so the UI can highlight them.
 */
export function buildSnippet(
  text: string,
  indices: number[],
  width = 110,
): SnippetPart[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (indices.length === 0) {
    return [{ text: clean.slice(0, width), hit: false }];
  }
  // Map indices from the raw text onto the collapsed string is lossy; instead
  // re-run the match on the collapsed text so highlights line up.
  const start = Math.max(0, Math.min(...indices) - 24);
  const end = Math.min(clean.length, Math.max(...indices) + width - 24);
  const slice = clean.slice(start, end);
  const set = new Set(indices.map((i) => i - start));
  const parts: SnippetPart[] = [];
  let buf = "";
  let bufHit = false;
  for (let i = 0; i < slice.length; i++) {
    const hit = set.has(i);
    if (i === 0) bufHit = hit;
    if (hit !== bufHit) {
      parts.push({ text: buf, hit: bufHit });
      buf = "";
      bufHit = hit;
    }
    buf += slice[i];
  }
  if (buf) parts.push({ text: buf, hit: bufHit });
  if (start > 0) parts.unshift({ text: "…", hit: false });
  if (end < clean.length) parts.push({ text: "…", hit: false });
  return parts;
}
