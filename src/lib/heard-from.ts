export const HEARD_FROM = ['door_hanger', 'google', 'nextdoor', 'facebook_instagram', 'referral', 'other'] as const;
export type HeardFrom = typeof HEARD_FROM[number];
export const HEARD_LABELS: Record<HeardFrom, [string, string]> = {
  door_hanger: ['Door hanger', 'Colgante de puerta'], google: ['Google', 'Google'], nextdoor: ['Nextdoor', 'Nextdoor'],
  facebook_instagram: ['Facebook-Instagram', 'Facebook-Instagram'], referral: ['Friend or neighbor', 'Amigo o vecino'], other: ['Other', 'Otro'],
};
export function validHeardFrom(value: unknown): value is HeardFrom {
  return typeof value === 'string' && (HEARD_FROM as readonly string[]).includes(value);
}