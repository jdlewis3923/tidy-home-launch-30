/**
 * Which services customers can actually sign up for right now.
 *
 * Lawn care and car detailing stay closed until those Pros are hired. Flip a
 * service back on by adding it to AVAILABLE_SERVICES — everything that shows a
 * service picker reads this one list, so nothing else needs editing.
 */
import type { ServiceType } from '@/lib/dashboard-pricing';

export const AVAILABLE_SERVICES: ServiceType[] = ['cleaning'];

export const isServiceAvailable = (s: ServiceType) => AVAILABLE_SERVICES.includes(s);

/** Shown wherever a closed service appears. */
export const SERVICE_WAITLIST_NOTE = 'Coming soon — join the waitlist';
