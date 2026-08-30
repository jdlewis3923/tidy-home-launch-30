/**
 * Printed door-hanger QR codes.
 *
 * 14,250 pieces are already printed, so this parser is the contract — the URLs
 * cannot change. Code format is LANG-ZIP-PLACEMENT:
 *   lang      → en | es
 *   zip       → 33156 | 33183 | 33186
 *   placement → hero (scanned off the hanger on the door)
 *              | card (kept the tear-off, scanned later)
 * 12 valid combinations, e.g. en-33156-hero, es-33186-card.
 *
 * Anything that does not parse still lands on /neighbor — never a 404, never an
 * error page — tagged placement=unknown, with the raw code logged.
 */

export const QR_LANGS = ["en", "es"] as const;
export const QR_ZIPS = ["33156", "33183", "33186"] as const;
export const QR_PLACEMENTS = ["hero", "card"] as const;

export type QrLang = (typeof QR_LANGS)[number];
export type QrZip = (typeof QR_ZIPS)[number];
export type QrPlacement = (typeof QR_PLACEMENTS)[number];

export type ParsedQrCode = { lang: QrLang; zip: QrZip; placement: QrPlacement };

/** Every valid printed code, in the order they appear on the print sheet. */
export const ALL_QR_CODES: string[] = QR_LANGS.flatMap((lang) =>
  QR_ZIPS.flatMap((zip) => QR_PLACEMENTS.map((placement) => `${lang}-${zip}-${placement}`)),
);

/** Returns the parsed parts, or null when the code is unknown or malformed. */
export function parseQrCode(raw: string | undefined | null): ParsedQrCode | null {
  if (!raw) return null;
  const parts = raw.trim().toLowerCase().split("-");
  if (parts.length !== 3) return null;
  const [lang, zip, placement] = parts;
  if (!(QR_LANGS as readonly string[]).includes(lang)) return null;
  if (!(QR_ZIPS as readonly string[]).includes(zip)) return null;
  if (!(QR_PLACEMENTS as readonly string[]).includes(placement)) return null;
  return { lang: lang as QrLang, zip: zip as QrZip, placement: placement as QrPlacement };
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
    params.set("utm_source", "doorhanger");
    params.set("utm_medium", "print");
    params.set("utm_campaign", `founding_${parsed.zip}`);
    params.set("utm_content", `${parsed.lang}_${parsed.placement}`);
  } else {
    params.set("src", "doorhanger");
    params.set("placement", "unknown");
    params.set("utm_source", "doorhanger");
    params.set("utm_medium", "print");
    params.set("utm_content", "unknown");
  }
  return `/neighbor?${params.toString()}`;
}
