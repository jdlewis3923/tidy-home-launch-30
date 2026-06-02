// Tidy Miami service-area ZIPs.
// Apply form / submit-application / AdminApplicants all reference this.
export const SERVICE_ZIPS = ["33156", "33183", "33186"] as const;

export function isInServiceArea(zip?: string | null): boolean {
  if (!zip) return true; // missing zip → don't flag (form still allows blank)
  const z = String(zip).trim().slice(0, 5);
  return (SERVICE_ZIPS as readonly string[]).includes(z);
}
