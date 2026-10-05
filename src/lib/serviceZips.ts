// Tidy Miami service-area ZIPs.
// Apply form / submit-application / AdminApplicants all reference this.
export { FOUNDING_ZIPS as SERVICE_ZIPS } from "@/lib/launch";
import { FOUNDING_ZIPS as SERVICE_ZIPS_ } from "@/lib/launch";

export function isInServiceArea(zip?: string | null): boolean {
  if (!zip) return true; // missing zip → don't flag (form still allows blank)
  const z = String(zip).trim().slice(0, 5);
  return (SERVICE_ZIPS_ as readonly string[]).includes(z);
}
