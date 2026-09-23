// Deno copy of src/lib/proKit.ts — kept identical below the marker.
// Parity is enforced by src/test/pro-kit-parity.test.ts. Edit both together.
// ---- SHARED KIT STANDARD ----
/**
 * Tidy — the Pro kit standard. Single source of truth for the front end.
 *
 * Copy rules: Tidy provides, the Pro chooses. Pros are 1099 independent
 * contractors, so nothing here is ever phrased as a requirement of
 * appearance, and no wording implies they work for Tidy as staff.
 *
 * Kit per service, provided at no cost to the Pro:
 *  · House cleaning — 2 embroidered polos + photo ID badge (no vest: the vest
 *    was a road-safety item for lawn work and does nothing indoors)
 *  · Lawn care     — 2 tees + 2 hi-vis vests + photo ID badge
 *  · Car care      — 2 tees + photo ID badge
 *
 * Vehicle magnets are offered on all three services, always opt-in, with a
 * $15/month vehicle advertising credit paid with the Friday deposit under a
 * short separate vehicle advertising agreement.
 */

export type KitServiceKey = "cleaning" | "lawn" | "car";

export const MAGNET_CREDIT_MONTHLY_USD = 15;

export type KitItem = {
  /** Vendor-order line, e.g. "Embroidered polo". */
  en: string;
  es: string;
  /** How many to order. */
  qty: number;
  /** Plural forms, written out so Spanish adjectives agree. */
  enPlural?: string;
  esPlural?: string;
  /** True when the line is sized from the Pro's answers. */
  sized?: "shirt" | "vest";
};

export const KIT_SERVICE_LABEL: Record<KitServiceKey, { en: string; es: string }> = {
  cleaning: { en: "House cleaning", es: "Limpieza del hogar" },
  lawn: { en: "Lawn care", es: "Cuidado del césped" },
  car: { en: "Car care", es: "Cuidado del Auto" },
};

const BADGE: KitItem = { en: "Photo ID badge", es: "Credencial con foto", qty: 1 };

export const KIT_BY_SERVICE: Record<KitServiceKey, KitItem[]> = {
  cleaning: [
    { en: "Embroidered polo", es: "Polo bordado", enPlural: "embroidered polos", esPlural: "polos bordados", qty: 2, sized: "shirt" },
    BADGE,
  ],
  lawn: [
    { en: "Tee", es: "Camiseta", enPlural: "tees", esPlural: "camisetas", qty: 2, sized: "shirt" },
    { en: "Hi-vis vest", es: "Chaleco de alta visibilidad", enPlural: "hi-vis vests", esPlural: "chalecos de alta visibilidad", qty: 2, sized: "vest" },
    BADGE,
  ],
  car: [
    { en: "Tee", es: "Camiseta", enPlural: "tees", esPlural: "camisetas", qty: 2, sized: "shirt" },
    BADGE,
  ],
};

/** Normalizes any stored service string onto a kit service key. */
export function kitServiceKey(service: string | null | undefined): KitServiceKey {
  const s = (service ?? "").toLowerCase();
  if (s.includes("lawn") || s.includes("césped") || s.includes("cesped")) return "lawn";
  if (s.includes("car") || s.includes("detail") || s.includes("auto")) return "car";
  return "cleaning";
}

export function kitItemsFor(service: string | null | undefined): KitItem[] {
  return KIT_BY_SERVICE[kitServiceKey(service)];
}

/** True only for lawn: the vest is a road-safety item. */
export function kitIncludesVest(service: string | null | undefined): boolean {
  return kitServiceKey(service) === "lawn";
}

/** Short human list, e.g. "2 embroidered polos + photo ID badge". */
export function kitContentsLine(service: string | null | undefined, lang: "en" | "es" = "en"): string {
  return kitItemsFor(service)
    .map((i) => (i.qty > 1 ? `${i.qty} ${i[lang === "en" ? "enPlural" : "esPlural"] ?? plural(i[lang], lang)}` : lcFirst(i[lang])))
    .join(" + ");
}

/** Lower-cases only the first letter, so "Photo ID badge" keeps its ID. */
function lcFirst(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function plural(label: string, lang: "en" | "es"): string {
  const l = lcFirst(label);
  if (lang === "es") return /[aeiouáéíóú]$/.test(l) ? `${l}s` : `${l}es`;
  return `${l}s`;
}

export type KitOrderSource = {
  legal_name?: string | null;
  badge_name?: string | null;
  pro_no?: string | null;
  service_line?: string | null;
  shirt_size?: string | null;
  shirt_cut?: string | null;
  vest_size?: string | null;
  cap?: string | null;
  mail_address?: string | null;
  badge_back?: string | null;
  magnets_opt_in?: boolean | null;
  magnet_test?: string | null;
  vehicle_year?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  vehicle_ad_signed_at?: string | null;
};

const MAGNET_TEST_HOLDS = ["yes", "sí", "si"];

/** True when the magnet test came back as a hold. */
export function magnetTestHolds(test: string | null | undefined): boolean {
  const t = (test ?? "").trim().toLowerCase();
  return MAGNET_TEST_HOLDS.some((v) => t === v || t.startsWith(`${v} `));
}

/**
 * Paste-ready vendor order. Plain text on purpose: it goes straight into an
 * order form or an email to the apparel and badge vendors.
 */
export function kitOrderSummary(k: KitOrderSource): string {
  const key = kitServiceKey(k.service_line);
  const lines: string[] = [];
  lines.push(`TIDY PRO KIT ORDER — ${KIT_SERVICE_LABEL[key].en}`);
  lines.push(`Pro: ${k.legal_name || k.badge_name || "—"}${k.pro_no ? ` (Pro ${k.pro_no})` : ""}`);
  lines.push("");
  for (const item of kitItemsFor(key)) {
    let size = "";
    if (item.sized === "shirt") size = ` — size ${k.shirt_size || "?"}${k.shirt_cut ? `, ${k.shirt_cut} cut` : ""}`;
    if (item.sized === "vest") size = ` — size ${k.vest_size || "?"} (worn over a shirt, sized up)`;
    lines.push(`${item.qty} × ${item.en}${size}`);
  }
  if (k.cap && !/declin/i.test(k.cap)) lines.push(`1 × Cap — ${k.cap}`);
  lines.push(`Badge name: ${k.badge_name || "—"}  ·  Badge back: ${k.badge_back || "No preference"}`);

  lines.push("");
  if (k.magnets_opt_in) {
    const vehicle = [k.vehicle_year, k.vehicle_make, k.vehicle_model].filter(Boolean).join(" ")
      || "vehicle not given";
    const holds = magnetTestHolds(k.magnet_test);
    lines.push(`Vehicle magnets: YES (opt-in) — 2 × door magnet`);
    lines.push(`Vehicle: ${vehicle}${k.vehicle_color ? `, ${k.vehicle_color}` : ""}`);
    lines.push(`Magnet test on driver's door: ${k.magnet_test || "not answered"}`);
    if (!holds) lines.push(`HOLD MAGNETS — the door will not hold a magnet. Nothing is taped to any vehicle.`);
    lines.push(`Vehicle advertising agreement: ${k.vehicle_ad_signed_at ? `signed ${k.vehicle_ad_signed_at.slice(0, 10)}` : "NOT SIGNED — do not order yet"}`);
    lines.push(`$${MAGNET_CREDIT_MONTHLY_USD}/month vehicle advertising credit starts with the Friday deposit once magnets are on.`);
  } else {
    lines.push("Vehicle magnets: no (opted out — nothing else changes)");
  }

  lines.push("");
  lines.push(`Ship to: ${(k.mail_address || "—").replace(/\s*\n\s*/g, ", ")}`);
  return lines.join("\n");
}
