export const PRO_GPS_RADIUS_METERS = 150;
export const PRO_ACCESS_LEAD_MINUTES = 30;
export const PRO_LOCKOUT_WAIT_MINUTES = 15;

export function navigationLinks(address: string) {
  const destination = encodeURIComponent(address.trim());
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    apple: `https://maps.apple.com/?daddr=${destination}`,
    waze: `https://waze.com/ul?q=${destination}&navigate=yes`,
  };
}

export function accessWindowOpen(start: string | null, checkedOut: boolean, now = Date.now()) {
  if (!start || checkedOut) return false;
  return now >= Date.parse(start) - PRO_ACCESS_LEAD_MINUTES * 60_000;
}

export function distanceMeters(a: {lat:number;lng:number}, b: {lat:number;lng:number}) {
  const radians = (n: number) => n * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLng/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

export function pinecrestLawnHoursAllowed(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(date);
  const value = (key: string) => parts.find(p=>p.type===key)?.value ?? '';
  const minutes = Number(value('hour'))*60 + Number(value('minute'));
  const day = value('weekday');
  if (day === 'Sun') return false;
  return day === 'Sat' ? minutes >= 540 && minutes < 840 : minutes >= 480 && minutes < 1020;
}