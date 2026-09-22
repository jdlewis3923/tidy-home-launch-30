/**
 * Drive-time estimation for hiring applicants.
 *
 * Pinecrest 33156 is the service anchor. We keep an embedded centroid table for
 * Miami-Dade and Broward ZIPs plus the city names people actually type on an
 * Indeed application, so scoring never depends on a network call.
 *
 * Straight-line miles x 2.2, rounded — the same rule the hiring spec uses.
 */

export const ANCHOR = { lat: 25.6668, lng: -80.3081 }; // Pinecrest 33156

type Point = { lat: number; lng: number };

/** ZIP centroids (Miami-Dade + Broward, the realistic commute basin). */
export const ZIP_CENTROIDS: Record<string, Point> = {
  // --- Pinecrest / Kendall / south Miami-Dade (the service area)
  "33156": { lat: 25.6668, lng: -80.3081 },
  "33157": { lat: 25.6, lng: -80.34 },
  "33158": { lat: 25.64, lng: -80.31 },
  "33143": { lat: 25.7, lng: -80.3 },
  "33146": { lat: 25.72, lng: -80.27 },
  "33176": { lat: 25.65, lng: -80.36 },
  "33183": { lat: 25.7, lng: -80.4 },
  "33186": { lat: 25.66, lng: -80.41 },
  "33173": { lat: 25.71, lng: -80.37 },
  "33193": { lat: 25.7, lng: -80.44 },
  "33196": { lat: 25.64, lng: -80.45 },
  "33189": { lat: 25.55, lng: -80.34 },
  "33190": { lat: 25.54, lng: -80.36 },
  "33177": { lat: 25.6, lng: -80.4 },
  "33170": { lat: 25.55, lng: -80.41 },
  "33187": { lat: 25.59, lng: -80.45 },
  "33032": { lat: 25.52, lng: -80.4 },
  "33033": { lat: 25.48, lng: -80.42 },
  "33030": { lat: 25.47, lng: -80.48 },
  "33031": { lat: 25.51, lng: -80.5 },
  "33034": { lat: 25.42, lng: -80.53 },
  "33035": { lat: 25.44, lng: -80.44 },
  // --- central / north Miami-Dade
  "33165": { lat: 25.73, lng: -80.35 },
  "33175": { lat: 25.73, lng: -80.41 },
  "33184": { lat: 25.75, lng: -80.4 },
  "33194": { lat: 25.75, lng: -80.47 },
  "33185": { lat: 25.73, lng: -80.44 },
  "33174": { lat: 25.76, lng: -80.36 },
  "33144": { lat: 25.76, lng: -80.31 },
  "33155": { lat: 25.74, lng: -80.31 },
  "33145": { lat: 25.75, lng: -80.24 },
  "33135": { lat: 25.77, lng: -80.23 },
  "33130": { lat: 25.77, lng: -80.2 },
  "33128": { lat: 25.78, lng: -80.2 },
  "33131": { lat: 25.77, lng: -80.19 },
  "33132": { lat: 25.79, lng: -80.19 },
  "33136": { lat: 25.79, lng: -80.2 },
  "33125": { lat: 25.78, lng: -80.24 },
  "33126": { lat: 25.78, lng: -80.3 },
  "33134": { lat: 25.75, lng: -80.27 },
  "33133": { lat: 25.73, lng: -80.24 },
  "33127": { lat: 25.81, lng: -80.21 },
  "33137": { lat: 25.82, lng: -80.19 },
  "33138": { lat: 25.85, lng: -80.19 },
  "33142": { lat: 25.81, lng: -80.24 },
  "33147": { lat: 25.85, lng: -80.24 },
  "33150": { lat: 25.85, lng: -80.21 },
  "33161": { lat: 25.89, lng: -80.19 },
  "33162": { lat: 25.93, lng: -80.18 },
  "33167": { lat: 25.88, lng: -80.23 },
  "33168": { lat: 25.89, lng: -80.21 },
  "33169": { lat: 25.94, lng: -80.21 },
  "33179": { lat: 25.96, lng: -80.19 },
  "33180": { lat: 25.96, lng: -80.14 },
  "33181": { lat: 25.89, lng: -80.16 },
  "33160": { lat: 25.94, lng: -80.13 },
  "33154": { lat: 25.87, lng: -80.12 },
  "33141": { lat: 25.85, lng: -80.13 },
  "33140": { lat: 25.81, lng: -80.13 },
  "33139": { lat: 25.78, lng: -80.14 },
  "33149": { lat: 25.69, lng: -80.16 },
  "33172": { lat: 25.79, lng: -80.35 },
  "33166": { lat: 25.82, lng: -80.31 },
  "33178": { lat: 25.82, lng: -80.39 },
  "33182": { lat: 25.78, lng: -80.4 },
  "33122": { lat: 25.8, lng: -80.32 },
  "33012": { lat: 25.86, lng: -80.3 },
  "33010": { lat: 25.83, lng: -80.28 },
  "33013": { lat: 25.86, lng: -80.27 },
  "33014": { lat: 25.9, lng: -80.31 },
  "33015": { lat: 25.94, lng: -80.32 },
  "33016": { lat: 25.89, lng: -80.34 },
  "33018": { lat: 25.91, lng: -80.38 },
  "33054": { lat: 25.9, lng: -80.25 },
  "33055": { lat: 25.94, lng: -80.28 },
  "33056": { lat: 25.95, lng: -80.25 },
  "33172X": { lat: 25.79, lng: -80.35 },
  // --- Broward
  "33009": { lat: 25.98, lng: -80.15 }, // Hallandale Beach
  "33019": { lat: 26.02, lng: -80.12 },
  "33020": { lat: 26.02, lng: -80.15 },
  "33021": { lat: 26.02, lng: -80.19 },
  "33023": { lat: 25.99, lng: -80.21 },
  "33024": { lat: 26.03, lng: -80.24 },
  "33025": { lat: 25.99, lng: -80.26 },
  "33026": { lat: 26.03, lng: -80.29 },
  "33027": { lat: 25.99, lng: -80.31 },
  "33028": { lat: 26.02, lng: -80.32 },
  "33029": { lat: 26.01, lng: -80.39 },
  "33312": { lat: 26.1, lng: -80.19 },
  "33314": { lat: 26.07, lng: -80.2 },
  "33317": { lat: 26.11, lng: -80.23 },
  "33324": { lat: 26.11, lng: -80.27 },
  "33328": { lat: 26.06, lng: -80.27 },
  "33330": { lat: 26.06, lng: -80.32 },
  "33331": { lat: 26.04, lng: -80.34 },
  "33332": { lat: 26.03, lng: -80.4 },
  "33301": { lat: 26.12, lng: -80.13 },
  "33304": { lat: 26.14, lng: -80.12 },
  "33311": { lat: 26.14, lng: -80.17 },
  "33313": { lat: 26.14, lng: -80.22 },
  "33315": { lat: 26.09, lng: -80.15 },
  "33316": { lat: 26.1, lng: -80.13 },
  "33319": { lat: 26.17, lng: -80.21 },
  "33322": { lat: 26.15, lng: -80.27 },
  "33325": { lat: 26.11, lng: -80.31 },
  "33326": { lat: 26.11, lng: -80.36 },
};

/** City / neighborhood names people type instead of a ZIP. */
export const CITY_CENTROIDS: Record<string, Point> = {
  pinecrest: { lat: 25.6668, lng: -80.3081 },
  kendall: { lat: 25.68, lng: -80.39 },
  "kendall west": { lat: 25.7, lng: -80.45 },
  "palmetto bay": { lat: 25.62, lng: -80.32 },
  "cutler bay": { lat: 25.58, lng: -80.35 },
  "south miami": { lat: 25.71, lng: -80.29 },
  "coral gables": { lat: 25.72, lng: -80.27 },
  miami: { lat: 25.77, lng: -80.2 },
  "miami beach": { lat: 25.79, lng: -80.13 },
  "north miami": { lat: 25.89, lng: -80.19 },
  "north miami beach": { lat: 25.93, lng: -80.16 },
  "miami gardens": { lat: 25.94, lng: -80.25 },
  "miami lakes": { lat: 25.91, lng: -80.31 },
  "miami springs": { lat: 25.82, lng: -80.29 },
  hialeah: { lat: 25.86, lng: -80.28 },
  "hialeah gardens": { lat: 25.89, lng: -80.35 },
  doral: { lat: 25.82, lng: -80.35 },
  "sweetwater ": { lat: 25.76, lng: -80.37 },
  sweetwater: { lat: 25.76, lng: -80.37 },
  westchester: { lat: 25.75, lng: -80.33 },
  homestead: { lat: 25.47, lng: -80.48 },
  "florida city": { lat: 25.45, lng: -80.48 },
  "richmond heights": { lat: 25.63, lng: -80.37 },
  "the hammocks": { lat: 25.67, lng: -80.44 },
  "country walk": { lat: 25.63, lng: -80.43 },
  "brickell": { lat: 25.76, lng: -80.19 },
  "key biscayne": { lat: 25.69, lng: -80.16 },
  "aventura": { lat: 25.96, lng: -80.14 },
  "sunny isles beach": { lat: 25.94, lng: -80.12 },
  "opa locka": { lat: 25.9, lng: -80.25 },
  "hallandale": { lat: 25.98, lng: -80.15 },
  "hallandale beach": { lat: 25.98, lng: -80.15 },
  hollywood: { lat: 26.02, lng: -80.16 },
  "pembroke pines": { lat: 26.01, lng: -80.29 },
  miramar: { lat: 25.98, lng: -80.29 },
  davie: { lat: 26.08, lng: -80.28 },
  plantation: { lat: 26.12, lng: -80.25 },
  "fort lauderdale": { lat: 26.12, lng: -80.14 },
  sunrise: { lat: 26.15, lng: -80.29 },
  weston: { lat: 26.1, lng: -80.4 },
  "cooper city": { lat: 26.06, lng: -80.29 },
};

function haversineMiles(a: Point, b: Point): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Resolve a free-text "city or ZIP" to a centroid, or null when unknown. */
export function resolveLocation(cityOrZip: string | null | undefined): Point | null {
  if (!cityOrZip) return null;
  const raw = cityOrZip.trim().toLowerCase();
  if (!raw) return null;

  const zip = raw.match(/\b(\d{5})\b/)?.[1];
  if (zip && ZIP_CENTROIDS[zip]) return ZIP_CENTROIDS[zip];

  // Longest city name that appears in the string wins ("north miami" over "miami").
  const names = Object.keys(CITY_CENTROIDS).sort((x, y) => y.length - x.length);
  for (const name of names) {
    if (raw.includes(name.trim())) return CITY_CENTROIDS[name];
  }
  return null;
}

/** Estimated one-way drive minutes to Pinecrest, or null when unknown. */
export function driveMinutes(cityOrZip: string | null | undefined): number | null {
  const point = resolveLocation(cityOrZip);
  if (!point) return null;
  return Math.round(haversineMiles(ANCHOR, point) * 2.2);
}
