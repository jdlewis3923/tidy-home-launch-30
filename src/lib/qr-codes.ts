/**
 * Printed door-hanger QR codes.
 *
 * Code format is LANG-ZIP-PLACEMENT[-ROUTE]:
 *   lang      → en | es
 *   zip       → any ZIP in QR_ZIPS (the original three plus the expansion ten)
 *   placement → hero (scanned off the hanger on the door)
 *              | card (kept the tear-off, scanned later)
 *   route     → OPTIONAL distribution route id, e.g. r14 — tells us which
 *               walker covered which street. Backwards compatible: the 12
 *               already-printed 3-segment codes keep working unchanged.
 *
 * Anything that does not parse still lands on /neighbor — never a 404, never an
 * error page — tagged placement=unknown, with the raw code logged.
 */

export const QR_LANGS = ["en", "es"] as const;

/** Original print run. ALL_QR_CODES stays pinned to these 12 combinations. */
export const QR_PRINTED_ZIPS = ["33156", "33183", "33186"] as const;

/** Full accepted allow-list: original three + the ten-ZIP expansion. */
export const QR_ZIPS = [
  "33156",
  "33183",
  "33186",
  "33176",
  "33193",
  "33157",
  "33173",
  "33196",
  "33175",
  "33165",
  "33177",
  "33143",
  "33155",
] as const;

export const QR_PLACEMENTS = ["hero", "card"] as const;

export type QrLang = (typeof QR_LANGS)[number];
export type QrZip = (typeof QR_ZIPS)[number];
export type QrPlacement = (typeof QR_PLACEMENTS)[number];

export type ParsedQrCode = {
  lang: QrLang;
  zip: QrZip;
  placement: QrPlacement;
  /** Distribution route id, or null for the original 3-segment codes. */
  route: string | null;
};

/** Every code in the original printed run, in print-sheet order. */
export const ALL_QR_CODES: string[] = QR_LANGS.flatMap((lang) =>
  QR_PRINTED_ZIPS.flatMap((zip) => QR_PLACEMENTS.map((placement) => `${lang}-${zip}-${placement}`)),
);

/** Returns the parsed parts, or null when the code is unknown or malformed. */
export function parseQrCode(raw: string | undefined | null): ParsedQrCode | null {
  if (!raw) return null;
  const parts = raw.trim().toLowerCase().split("-");
  if (parts.length < 3 || parts.length > 4) return null;
  const [lang, zip, placement, route] = parts;
  if (!(QR_LANGS as readonly string[]).includes(lang)) return null;
  if (!(QR_ZIPS as readonly string[]).includes(zip)) return null;
  if (!(QR_PLACEMENTS as readonly string[]).includes(placement)) return null;
  return {
    lang: lang as QrLang,
    zip: zip as QrZip,
    placement: placement as QrPlacement,
    route: route ? route.slice(0, 24) : null,
  };
}

/**
 * Destination for a scan. Always /neighbor — a bad code degrades, it never
 * errors.
 */
export function qrRedirectTarget(raw: string | undefined | null): string {
  const parsed = parseQrCode(raw);
  const params = new URLSearchParams();
  if (parsed) {
    params.set("lang", parsed.lang);
    params.set("zip", parsed.zip);
    params.set("src", "doorhanger");
    params.set("placement", parsed.placement);
    if (parsed.route) params.set("route", parsed.route);
    params.set("utm_source", "doorhanger");
    params.set("utm_medium", "print");
    params.set("utm_campaign", `founding_${parsed.zip}`);
    params.set("utm_content", `${parsed.lang}_${parsed.placement}`);
    if (parsed.route) params.set("utm_term", parsed.route);
  } else {
    params.set("src", "doorhanger");
    params.set("placement", "unknown");
    params.set("utm_source", "doorhanger");
    params.set("utm_medium", "print");
    params.set("utm_content", "unknown");
  }
  return `/neighbor?${params.toString()}`;
}
