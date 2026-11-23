import type { ScopeRow } from './serviceScope';

export const CAR_CARE_DRAFT_VERSION = '2026-11-23-draft';
export const CAR_CARE_DRAFT_PAY = {
  wash: [16, 20, 26],
  fullDetail: [78, 88, 115],
  addonPercent: 40,
} as const;

/** A draft only: retains the existing ICA structure and snapshots live car scope. */
export function buildCarCareICADraft(baseLawnAgreement: string, rows: ScopeRow[]) {
  const current = rows.filter(row => row.active && (row.service === 'car_wash' || row.service === 'car_detail'));
  if (!current.some(row => row.service === 'car_wash' && row.section === 'included') ||
      !current.some(row => row.service === 'car_detail' && row.section === 'included')) throw new Error('Both car scopes are required');
  const start = baseLawnAgreement.indexOf('SCHEDULE A — PAY');
  if (start < 0) throw new Error('Existing Schedule A is required');
  let body = baseLawnAgreement.slice(0, start)
    .replace('LAWN CARE PRO', 'CAR CARE PRO')
    .replace('Service: Lawn Care', 'Service: Car Care')
    .replace('independent lawn care business', 'independent car care business')
    .replace('residential lawn care visits and the lawn add-ons listed in Schedule A', 'driveway maintenance washes, full details and authorized car add-ons listed in Schedules A and B')
    .replace(/2\.3 .*?(?=2\.4)/s, '2.3 Contractor supplies and pays for its own wash and detail equipment, safe products, hose and nozzle, buckets, vacuum/extractor, outdoor extension cord, safety gear, vehicle and phone. Contractor uses the Member’s outdoor spigot and electrical outlet when present; for homes genuinely without a spigot, Contractor brings water. ')
    .replace(/3\.2 .*?(?=3\.3)/s, '3.2 Contractor completes each booked car visit on its confirmed day and arrival window. The job card identifies the vehicle, visit kind and authorized add-ons. ')
    .replace(/3\.3 .*?(?=3\.4)/s, '3.3 Rain-outs: Contractor reports unsafe outdoor conditions to Tidy. The visit moves to the next covered open day. Visits not performed are not paid. ')
    .replace(/3\.6 .*?(?= 4\. PAY)/s, '3.6 Vehicle size is confirmed against the Member’s booked vehicle. Report a different or bigger vehicle before extra work. Tidy confirms any size change and Contractor is paid the corrected rate starting with the visit Tidy confirms. ')
    .replace(/9\.5 .*?(?=9\.6)/s, '9.5 Access, utilities and pets. Contractor follows the job-card parking, keys, gate and pet instructions and closes every gate used. Booking is conditional on use of the home’s outdoor spigot and outlet when present. If a Member reports No despite having one or blocks access, Contractor records it in the Visit Report and Tidy contacts the Member; the visit still counts as used. ')
    .replace(/9\.6 .*?(?=9\.7)/s, '9.6 Local rules. Contractor follows property permission, local noise, water-use and runoff rules. Never wash where it is prohibited. Tidy handles company registration required of Tidy; Contractor keeps its own vehicle, licence and equipment legal. ')
    .replace(/9\.7 .*?(?= 10\. ITEMS)/s, '9.7 Safety and scope boundaries. Protect the vehicle and surroundings, use equipment and products safely, and report hazards before proceeding. Do not remove child seats or move or bag personal belongings. Engine bay, odor treatment and paint correction are not offered. ');
  const pay = CAR_CARE_DRAFT_PAY;
  body += `SCHEDULE A — PAY\nVehicle | Maintenance wash | Full detail\nSedan / coupe | $${pay.wash[0]} | $${pay.fullDetail[0]}\nSUV / crossover | $${pay.wash[1]} | $${pay.fullDetail[1]}\nTruck / 3-row / van | $${pay.wash[2]} | $${pay.fullDetail[2]}\nPay is flat per completed job, never cadence-dependent. Authorized add-ons pay ${pay.addonPercent}% of the Member price, including eligible gifts.\n\n`;
  body += 'SCHEDULE B — SERVICE SCOPE (snapshot from public.service_scope)\n';
  for (const service of ['car_wash', 'car_detail'] as const) {
    const mine = current.filter(row => row.service === service).sort((a, b) => a.sort_order - b.sort_order);
    body += `\n${service === 'car_wash' ? 'MAINTENANCE WASH' : 'FULL DETAIL — EVERYTHING IN THE WASH, PLUS'} (version ${Math.max(...mine.map(row => row.scope_version))})\n`;
    for (const section of ['included', 'not_included', 'add_on', 'customer_must', 'notice'] as const) {
      const label = { included: 'INCLUDED', not_included: 'NOT INCLUDED', add_on: 'PAID ADD-ONS', customer_must: 'MEMBER REQUIREMENTS', notice: 'NOTICE' }[section];
      const items = mine.filter(row => row.section === section);
      if (items.length) body += `\n${label}\n${items.map(row => `- ${row.text_en}`).join('\n')}\n`;
    }
  }
  body += '\nSIGNATURES\nBy signing, both parties agree to this Independent Contractor Agreement, including Schedules A and B.\nTidy Home Concierge LLC — Justin Lewis, Founder · Signature · Date\nContractor — Signature · Printed name · Date\n';
  return { service: 'detailing', lang: 'en', version: CAR_CARE_DRAFT_VERSION, title: 'DRAFT — Independent Contractor Agreement — Car Care Pro', body, is_current: false };
}