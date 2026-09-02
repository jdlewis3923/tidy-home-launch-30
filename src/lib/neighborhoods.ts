/**
 * Printed door-hanger ZIP → neighborhood name. Naming the visitor's actual
 * neighborhood is the whole point of a door hanger, so the /neighbor hero
 * injects this from the `?zip=` param the QR code carries.
 */
export const ZIP_NEIGHBORHOODS: Record<string, string> = {
  "33156": "Pinecrest",
  "33183": "Kendall",
  "33186": "Kendall West",
};

/** Falls back to the neutral service-area phrase when no ZIP was scanned. */
export function neighborhoodForZip(zip?: string | null): string | null {
  if (!zip) return null;
  return ZIP_NEIGHBORHOODS[String(zip).trim().slice(0, 5)] ?? null;
}

/** Only ZIPs we actually printed get a live scarcity count. */
export function printedZip(zip?: string | null): string | null {
  if (!zip) return null;
  const z = String(zip).trim().slice(0, 5);
  return z in ZIP_NEIGHBORHOODS ? z : null;
}

export const FOUNDING_CAP = 25;
