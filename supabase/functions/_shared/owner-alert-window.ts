/** Owner channels are separate; the 9 PM digest minute is included. */
export function ownerAlertWindowOpen(now = new Date()): boolean {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  return minutes >= 8 * 60 && minutes <= 21 * 60;
}