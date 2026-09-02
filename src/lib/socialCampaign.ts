/**
 * FOUNDING NEIGHBOR SOCIAL CAMPAIGN — caption library + calendar math.
 *
 * These captions replace the old "Pre-Launch" countdown copy. Tidy is OPEN, so
 * every caption here is EVERGREEN: no launch date, no countdown, no "coming
 * soon", and never a request or incentive for a review (Google policy).
 *
 * The hook is the founding offer:
 *   - founding rate locked for life
 *   - one free premium add-on on the first visit
 *   - first visit perfect or it's free
 *   - capped at 25 founding homes per ZIP
 *
 * The calendar start date is NOT hardcoded — it is stored in
 * `app_settings.social_campaign_start_date` and editable on /admin/social-launch,
 * defaulting to the day after arming. Cadence below mirrors the original
 * calendar spacing (Nextdoor every ~2.4 days, Meta ~daily).
 */
import { ZIP_NEIGHBORHOODS } from "@/lib/neighborhoods";

export type SocialChannel = "nextdoor" | "meta_combined" | "instagram" | "facebook";

export const CAMPAIGN_NAMES = {
  nextdoor: "Nextdoor Founding Neighbor Campaign",
  meta: "Meta IG + FB Founding Neighbor Campaign",
} as const;

/** Hours between consecutive posts, per channel — Meta only (Nextdoor uses cadence below). */
export const CADENCE_HOURS: Record<"nextdoor" | "meta", number> = {
  nextdoor: 56,
  meta: 22,
};

/** First post of each channel goes out at this UTC hour on the start date. */
export const FIRST_POST_UTC_HOUR: Record<"nextdoor" | "meta", number> = {
  nextdoor: 13,
  meta: 15,
};

/**
 * NEXTDOOR CADENCE — configurable, stored in app_settings.social_campaign_nextdoor_cadence.
 *
 * Nextdoor's own published guidance for business pages is one post every TWO
 * WEEKS (engagement declines after roughly two weeks), with the strongest
 * engagement between 5–7 PM local and on Thursday/Friday. Hence: Thursdays at
 * 6:00 PM America/New_York, 14 days apart. Meta is unaffected.
 */
export interface CampaignCadence {
  /** Days between consecutive posts. */
  intervalDays: number;
  /** 0 = Sunday … 4 = Thursday. The first post lands on this weekday. */
  weekday: number;
  /** Local hour (America/New_York), 24h. */
  hour: number;
}

export const NEXTDOOR_TIMEZONE = "America/New_York";

export const DEFAULT_NEXTDOOR_CADENCE: CampaignCadence = {
  intervalDays: 14,
  weekday: 4, // Thursday
  hour: 18, // 6 PM ET
};

export function parseCadence(raw: unknown): CampaignCadence {
  const d = DEFAULT_NEXTDOOR_CADENCE;
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
  };
  return {
    intervalDays: num(o.intervalDays, d.intervalDays, 1, 90),
    weekday: num(o.weekday, d.weekday, 0, 6),
    hour: num(o.hour, d.hour, 0, 23),
  };
}

/** Offset of America/New_York from UTC in hours at the given instant (-4 or -5). */
function etOffsetHours(at: Date): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: NEXTDOOR_TIMEZONE,
    timeZoneName: "shortOffset",
  }).format(at);
  const m = s.match(/GMT([+-]\d+)/);
  return m ? Number(m[1]) : -5;
}

/** A UTC Date for the given America/New_York wall-clock date + hour. */
function etWallClockToUtc(y: number, mo: number, d: number, hour: number): Date {
  const guess = new Date(Date.UTC(y, mo, d, hour));
  const off = etOffsetHours(guess);
  return new Date(Date.UTC(y, mo, d, hour - off));
}

/**
 * Nextdoor schedule: first post on the first `cadence.weekday` on/after the
 * start date, then every `cadence.intervalDays`, always at `cadence.hour` ET.
 */
export function nextdoorScheduledFor(
  startDate: string,
  index: number,
  cadence: CampaignCadence = DEFAULT_NEXTDOOR_CADENCE,
): Date {
  const anchor = new Date(`${startDate}T12:00:00Z`);
  const delta = (cadence.weekday - anchor.getUTCDay() + 7) % 7;
  const first = new Date(anchor.getTime() + delta * 86400000);
  const day = new Date(first.getTime() + index * cadence.intervalDays * 86400000);
  return etWallClockToUtc(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), cadence.hour);
}

/** Scheduled time for post index (0-based) given a YYYY-MM-DD start date. */
export function scheduledFor(
  startDate: string,
  platform: "nextdoor" | "meta",
  index: number,
  cadence: CampaignCadence = DEFAULT_NEXTDOOR_CADENCE,
): Date {
  if (platform === "nextdoor") return nextdoorScheduledFor(startDate, index, cadence);
  const base = new Date(`${startDate}T00:00:00Z`);
  base.setUTCHours(FIRST_POST_UTC_HOUR[platform], 0, 0, 0);
  return new Date(base.getTime() + index * CADENCE_HOURS[platform] * 3600 * 1000);
}

/** Tomorrow, UTC, as YYYY-MM-DD — the default campaign start. */
export function defaultStartDate(now = new Date()): string {
  const d = new Date(now.getTime() + 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}


const N = ZIP_NEIGHBORHOODS;

// ── NEXTDOOR — 12 posts, neighborly register ─────────────────────────────────
export const NEXTDOOR_POSTS: CampaignPost[] = [
  {
    post_number: 1,
    title: "Founding neighbors in Pinecrest",
    zip: "33156",
    en: `Hi ${N["33156"]} — we're Tidy, and we're open here.\n\nCleaning, lawn and mobile car care on one plan. Same Pro every visit. One flat price per visit. Cancel anytime.\n\nWe're taking 25 founding homes in ${N["33156"]}. Founding neighbors lock their rate for life and get one free premium add-on on the first visit.\n\nQuestions welcome — I read every comment.\n\n— Justin Lewis · Founder`,
    es: `Hola ${N["33156"]} — somos Tidy y ya estamos abiertos aquí.\n\nLimpieza, grama y cuidado del carro a domicilio en un solo plan. El mismo Pro en cada visita. Un precio fijo por visita. Cancela cuando quieras.\n\nEstamos tomando 25 hogares fundadores en ${N["33156"]}. Los vecinos fundadores fijan su precio de por vida y reciben un servicio premium gratis en la primera visita.\n\nPregunta lo que quieras — leo cada comentario.\n\n— Justin Lewis · Fundador`,
  },
  {
    post_number: 2,
    title: "House cleaning, same Pro",
    zip: "33183",
    en: `House cleaning in ${N["33183"]}, from $139 a visit for a size 1 home.\n\nKitchen, baths, floors and dusting. Same crew every visit, so nobody has to be shown where anything goes twice.\n\nFirst visit perfect or it's free.`,
    es: `Limpieza de casa en ${N["33183"]}, desde $139 por visita para un hogar tamaño 1.\n\nCocina, baños, pisos y polvo. El mismo equipo en cada visita, así nadie tiene que explicar dos veces dónde va cada cosa.\n\nPrimera visita perfecta o es gratis.`,
  },
  {
    post_number: 3,
    title: "Lawn care from $45",
    zip: "33186",
    en: `Lawn care in ${N["33186"]}, from $45 a visit.\n\nMow, edge, trim and blow down — clippings hauled off, gate closed behind us.\n\nAdd it to cleaning or car care and it's all one plan, one bill.`,
    es: `Cuidado de grama en ${N["33186"]}, desde $45 por visita.\n\nCortamos, bordeamos, recortamos y soplamos — nos llevamos los recortes y cerramos el portón al salir.\n\nCombínalo con limpieza o cuidado del carro: un solo plan, una sola factura.`,
  },
  {
    post_number: 4,
    title: "25 founding homes per ZIP",
    zip: "33156",
    en: `We cap founding pricing at 25 homes per ZIP, on purpose.\n\nSmall route, same Pros, no scrambling. It's the only way the same crew keeps showing up at the same houses.\n\nFounding neighbors in ${N["33156"]}: your rate is locked for life.`,
    es: `Limitamos el precio fundador a 25 hogares por código postal, a propósito.\n\nRuta pequeña, los mismos Pros, sin carreras. Es la única forma de que el mismo equipo siga llegando a las mismas casas.\n\nVecinos fundadores en ${N["33156"]}: su precio queda fijo de por vida.`,
  },
  {
    post_number: 5,
    title: "Flat price by size",
    zip: "33183",
    en: `No square-footage math. No surprise line items.\n\nThree sizes per service, one flat price per visit. You see the number before you book, and founding neighbors keep that number for life.`,
    es: `Sin cálculos de pies cuadrados. Sin cargos sorpresa.\n\nTres tamaños por servicio y un precio fijo por visita. Ves el número antes de reservar, y los vecinos fundadores conservan ese número de por vida.`,
  },
  {
    post_number: 6,
    title: "Car care in your driveway",
    zip: "33186",
    en: `Shine Complete: car care in your own driveway, from $149 a month.\n\nHand wash, wheels, glass and an interior wipe-down. You never move the car.\n\n${N["33186"]} founding spots are open.`,
    es: `Shine Complete: cuidado del carro en tu propia entrada, desde $149 al mes.\n\nLavado a mano, ruedas, vidrios y limpieza interior. No tienes que mover el carro.\n\nHay lugares fundadores abiertos en ${N["33186"]}.`,
  },
  {
    post_number: 7,
    title: "Same Pro every visit",
    zip: "33156",
    en: `The same Pro, every visit.\n\nEvery Tidy Pro is background-checked and covered by insurance, and you keep the same one — they learn your gate code, your dog's name, which room matters most.`,
    es: `El mismo Pro, en cada visita.\n\nCada Pro de Tidy pasa verificación de antecedentes y está cubierto por seguro, y siempre te toca el mismo — aprende el código del portón, el nombre del perro y cuál cuarto importa más.`,
  },
  {
    post_number: 8,
    title: "One free premium add-on",
    zip: "33183",
    en: `Founding neighbors get one free premium add-on on the first visit — you pick it.\n\nInside-the-fridge, oven, bed edge reset, clay bar. Your choice, no charge, no conditions.`,
    es: `Los vecinos fundadores reciben un servicio premium gratis en la primera visita — tú lo eliges.\n\nInterior del refrigerador, horno, reinicio de bordes de jardineras, clay bar. Tú decides, sin costo y sin condiciones.`,
  },
  {
    post_number: 9,
    title: "First visit perfect or it's free",
    zip: "33186",
    en: `First visit perfect or it's free. That's the whole promise.\n\nIf the first visit isn't right, tell us and you don't pay for it. No forms, no argument.\n\n${N["33186"]} — founding spots are capped at 25 homes.`,
    es: `Primera visita perfecta o es gratis. Esa es toda la promesa.\n\nSi la primera visita no queda bien, dínoslo y no la pagas. Sin formularios y sin discusiones.\n\n${N["33186"]} — los lugares fundadores están limitados a 25 hogares.`,
  },
  {
    post_number: 10,
    title: "Three services, one plan",
    zip: "33156",
    en: `Three services. One plan. One bill.\n\nCleaning, lawn and car care, scheduled together instead of three companies and three text threads. Hold two or more and you get a free premium add-on every month.`,
    es: `Tres servicios. Un plan. Una factura.\n\nLimpieza, grama y cuidado del carro, coordinados juntos en vez de tres empresas y tres cadenas de mensajes. Con dos o más servicios recibes un servicio premium gratis cada mes.`,
  },
  {
    post_number: 11,
    title: "Saturdays back",
    zip: "33183",
    en: `Nobody in ${N["33183"]} moved here to spend Saturday behind a mower.\n\nLawn from $45 a visit, cleaning from $139. Set it once and it just happens.`,
    es: `Nadie en ${N["33183"]} se mudó aquí para pasar el sábado detrás de una podadora.\n\nGrama desde $45 por visita, limpieza desde $139. Lo configuras una vez y simplemente pasa.`,
  },
  {
    post_number: 12,
    title: "Founding spots in Kendall West",
    zip: "33186",
    en: `Founding neighbor, plainly:\n\nYour rate is locked for life. One free premium add-on on the first visit. First visit perfect or it's free. Capped at 25 homes in ${N["33186"]}.\n\nNo contract. Cancel anytime.`,
    es: `Vecino fundador, en simple:\n\nTu precio queda fijo de por vida. Un servicio premium gratis en la primera visita. Primera visita perfecta o es gratis. Limitado a 25 hogares en ${N["33186"]}.\n\nSin contrato. Cancela cuando quieras.`,
  },
];

// ── META (IG + FB) — 30 posts, punchier register ─────────────────────────────
export const META_POSTS: CampaignPost[] = [
  {
    post_number: 1,
    title: "Open in Pinecrest",
    zip: "33156",
    en: `Tidy is open in ${N["33156"]}.\n\nCleaning, lawn and car care on one plan. One flat price per visit.`,
    es: `Tidy ya está abierto en ${N["33156"]}.\n\nLimpieza, grama y cuidado del carro en un solo plan. Un precio fijo por visita.`,
  },
  {
    post_number: 2,
    title: "Cleaning from $139",
    zip: "33183",
    en: `House cleaning from $139 a visit for a size 1 home.\n\nKitchen, baths, floors, dusting. Same crew every time.`,
    es: `Limpieza de casa desde $139 por visita para un hogar tamaño 1.\n\nCocina, baños, pisos y polvo. El mismo equipo siempre.`,
  },
  {
    post_number: 3,
    title: "Lawn from $45",
    zip: "33186",
    en: `Lawn care from $45 a visit.\n\nMow, edge, trim, blow down. Clippings gone.`,
    es: `Cuidado de grama desde $45 por visita.\n\nCortar, bordear, recortar y soplar. Sin recortes en el piso.`,
  },
  {
    post_number: 4,
    title: "Car care from $149",
    zip: "33156",
    en: `Shine Complete from $149 a month.\n\nHand wash, wheels, glass, interior wipe-down — in your driveway.`,
    es: `Shine Complete desde $149 al mes.\n\nLavado a mano, ruedas, vidrios e interior — en tu entrada.`,
  },
  {
    post_number: 5,
    title: "One plan, three services",
    zip: "33183",
    en: `Three services. One plan. One bill. One crew that knows your house.`,
    es: `Tres servicios. Un plan. Una factura. Un equipo que conoce tu casa.`,
  },
  {
    post_number: 6,
    title: "Rate locked for life",
    zip: "33186",
    en: `Founding neighbors lock their rate for life.\n\nWhat you pay on visit one is what you pay on visit fifty.`,
    es: `Los vecinos fundadores fijan su precio de por vida.\n\nLo que pagas en la primera visita es lo que pagas en la visita cincuenta.`,
  },
  {
    post_number: 7,
    title: "25 homes per ZIP",
    zip: "33156",
    en: `Founding pricing is capped at 25 homes in ${N["33156"]}.\n\nSmall route, same Pros, nothing rushed.`,
    es: `El precio fundador está limitado a 25 hogares en ${N["33156"]}.\n\nRuta pequeña, los mismos Pros, nada apurado.`,
  },
  {
    post_number: 8,
    title: "Free premium add-on",
    zip: "33183",
    en: `One free premium add-on on your first visit. You choose it. No conditions.`,
    es: `Un servicio premium gratis en tu primera visita. Tú lo eliges. Sin condiciones.`,
  },
  {
    post_number: 9,
    title: "Perfect or free",
    zip: "33186",
    en: `First visit perfect or it's free.\n\nSay the word and you don't pay for it.`,
    es: `Primera visita perfecta o es gratis.\n\nSolo dilo y no la pagas.`,
  },
  {
    post_number: 10,
    title: "Flat price by size",
    zip: "33156",
    en: `No square-footage math. Three sizes, one flat price per visit, shown before you book.`,
    es: `Sin cálculos de pies cuadrados. Tres tamaños, un precio fijo por visita, visible antes de reservar.`,
  },
  {
    post_number: 11,
    title: "Kendall lawns",
    zip: "33183",
    en: `${N["33183"]} lawns grow year-round. Your Saturday doesn't have to.\n\nLawn care from $45 a visit.`,
    es: `La grama en ${N["33183"]} crece todo el año. Tu sábado no tiene por qué.\n\nCuidado de grama desde $45 por visita.`,
  },
  {
    post_number: 12,
    title: "Background-checked Pros",
    zip: "33186",
    en: `Every Tidy Pro is background-checked and covered by insurance — and it's the same Pro every visit.`,
    es: `Cada Pro de Tidy pasa verificación de antecedentes y está cubierto por seguro — y es el mismo Pro en cada visita.`,
  },
  {
    post_number: 13,
    title: "Cancel anytime",
    zip: "33156",
    en: `No contract. Pause or cancel from your dashboard in two taps.`,
    es: `Sin contrato. Pausa o cancela desde tu panel en dos toques.`,
  },
  {
    post_number: 14,
    title: "Kitchen reset",
    zip: "33183",
    en: `Come home to a kitchen you didn't have to reset.\n\nCleaning from $139 a visit.`,
    es: `Llega a una cocina que no tuviste que ordenar.\n\nLimpieza desde $139 por visita.`,
  },
  {
    post_number: 15,
    title: "Driveway detail",
    zip: "33186",
    en: `Your car gets handled where it's parked. Nothing to drop off, nothing to wait for.`,
    es: `Tu carro se atiende donde está estacionado. Nada que dejar, nada que esperar.`,
  },
  {
    post_number: 16,
    title: "Founding in Pinecrest",
    zip: "33156",
    en: `Founding neighbor in ${N["33156"]}: locked rate, one free premium add-on, first visit perfect or free.`,
    es: `Vecino fundador en ${N["33156"]}: precio fijo, un servicio premium gratis y primera visita perfecta o gratis.`,
  },
  {
    post_number: 17,
    title: "Two services, free add-on",
    zip: "33183",
    en: `Hold two or more services and one premium add-on is free every month. Your pick.`,
    es: `Con dos o más servicios, un servicio premium es gratis cada mes. Tú eliges.`,
  },
  {
    post_number: 18,
    title: "Same crew",
    zip: "33186",
    en: `You shouldn't have to re-explain your own house every two weeks. Same crew, every visit.`,
    es: `No deberías tener que explicar tu casa otra vez cada dos semanas. El mismo equipo, cada visita.`,
  },
  {
    post_number: 19,
    title: "Set it once",
    zip: "33156",
    en: `Set your plan once. Cleaning, lawn and car care land on schedule after that.`,
    es: `Configura tu plan una vez. Después, limpieza, grama y carro llegan según el calendario.`,
  },
  {
    post_number: 20,
    title: "Photo-verified visits",
    zip: "33183",
    en: `Every visit comes back photo-verified, so you can see the work without standing over it.`,
    es: `Cada visita llega verificada con fotos, para que veas el trabajo sin tener que supervisarlo.`,
  },
  {
    post_number: 21,
    title: "Kendall West spots",
    zip: "33186",
    en: `Founding spots in ${N["33186"]} are capped at 25 homes and don't reopen.`,
    es: `Los lugares fundadores en ${N["33186"]} están limitados a 25 hogares y no se vuelven a abrir.`,
  },
  {
    post_number: 22,
    title: "Bigger home, still flat",
    zip: "33156",
    en: `Size 2 home? $189 a visit. Size 3? $279. Still flat, still shown up front.`,
    es: `¿Hogar tamaño 2? $189 por visita. ¿Tamaño 3? $279. Igual fijo y visible desde el inicio.`,
  },
  {
    post_number: 23,
    title: "Big lots too",
    zip: "33183",
    en: `Bigger lot: $65 or $99 a visit depending on mowable turf. Same crew, same day of the week.`,
    es: `Terreno más grande: $65 o $99 por visita según la grama a cortar. El mismo equipo, el mismo día de la semana.`,
  },
  {
    post_number: 24,
    title: "Interior detail",
    zip: "33186",
    en: `Sand in the footwells, salt on the glass. Shine Complete keeps up with Miami.`,
    es: `Arena en los tapetes, sal en los vidrios. Shine Complete le sigue el paso a Miami.`,
  },
  {
    post_number: 25,
    title: "One bill",
    zip: "33156",
    en: `One bill for the house, the yard and the car. One number, every month.`,
    es: `Una factura para la casa, el patio y el carro. Un solo número cada mes.`,
  },
  {
    post_number: 26,
    title: "Two minutes to start",
    zip: "33183",
    en: `Building your plan takes about two minutes. No contract at the end of it.`,
    es: `Armar tu plan toma unos dos minutos. Y no hay contrato al final.`,
  },
  {
    post_number: 27,
    title: "Neighbors, not accounts",
    zip: "33186",
    en: `We run ${N["33186"]} as a route of neighbors, not a list of accounts. That's why it's capped at 25.`,
    es: `Manejamos ${N["33186"]} como una ruta de vecinos, no una lista de cuentas. Por eso está limitada a 25.`,
  },
  {
    post_number: 28,
    title: "Locked means locked",
    zip: "33156",
    en: `Locked rate means locked. Founding neighbors don't get a price increase letter.`,
    es: `Precio fijo significa fijo. Los vecinos fundadores no reciben carta de aumento.`,
  },
  {
    post_number: 29,
    title: "Everything on one plan",
    zip: "33183",
    en: `Cleaning. Lawn. Car care. One plan in ${N["33183"]}, one flat price per visit.`,
    es: `Limpieza. Grama. Carro. Un solo plan en ${N["33183"]}, un precio fijo por visita.`,
  },
  {
    post_number: 30,
    title: "Claim a founding spot",
    zip: "33186",
    en: `Founding neighbor: rate locked for life, one free premium add-on, first visit perfect or it's free. 25 homes per ZIP.`,
    es: `Vecino fundador: precio fijo de por vida, un servicio premium gratis y primera visita perfecta o gratis. 25 hogares por código postal.`,
  },
];

/** Every row we manage, with its stored caption and title, ready for the DB. */
export function campaignRows(): {
  channel: SocialChannel;
  post_number: number;
  title: string;
  caption: string;
}[] {
  return [
    ...NEXTDOOR_POSTS.map(p => ({
      channel: "nextdoor" as SocialChannel,
      post_number: p.post_number,
      title: p.title,
      caption: buildCaption(p, "nextdoor"),
    })),
    ...META_POSTS.map(p => ({
      channel: "meta_combined" as SocialChannel,
      post_number: p.post_number,
      title: p.title,
      caption: buildCaption(p, "meta"),
    })),
  ];
}
