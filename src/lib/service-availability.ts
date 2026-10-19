/**
 * Which services customers can actually sign up for right now.
 *
 * All three services may be selected and reserved. Paid conversion remains
 * independently gated by verified lawn size and the approved car launch.
 */
import type { ServiceType } from '@/lib/dashboard-pricing';

export const AVAILABLE_SERVICES: ServiceType[] = ['cleaning', 'lawn', 'detailing'];

export const isServiceAvailable = (s: ServiceType) => AVAILABLE_SERVICES.includes(s);

/** Shown wherever a closed service appears. */
export const SERVICE_WAITLIST_NOTE = 'Coming soon — join the waitlist';
