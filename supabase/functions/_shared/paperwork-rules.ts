export const POSITIONS: Record<string,string> = { cleaning:'House Cleaning Pro', lawn:'Lawn Care Pro', detailing:'Car Care Pro' };
export type DocumentStatus = { documentId:number; status:string; signedAt?:number; expiresAt?:number };
export function paperworkState(rows:DocumentStatus[], ids:{w9:number;coi:number;agreement:number;intake:number}, now=Date.now(), siteSignedAt:string|null=null) {
  const find=(id:number)=>rows.find(r=>r.documentId===id);
  const w9=find(ids.w9),coi=find(ids.coi),agreement=find(ids.agreement),intake=find(ids.intake);
  const accepted=(r:DocumentStatus|undefined)=>!!r&&['approved','completed'].includes(r.status);
  const site=!!siteSignedAt;const signed=site||(!!agreement?.signedAt&&agreement.signedAt>0);
  const expiry=coi?.expiresAt ? new Date(coi.expiresAt*1000).toISOString():null;
  const coiApproved=accepted(coi)&&(!expiry||Date.parse(expiry)>now);
  return { status:{w9:w9?.status??'notAssigned',coi:coi?.status??'notAssigned',agreement:site?'completed':agreement?.status??'notAssigned',intake:intake?.status??'notAssigned'},complete:accepted(intake)&&!!intake?.signedAt&&accepted(w9)&&coiApproved&&(site||accepted(agreement))&&signed,signedAt:site?new Date(siteSignedAt??'').toISOString():signed?new Date(Number(agreement?.signedAt)*1000).toISOString():null,expiry,coiApproved };
}
export function paperworkDigest(rows:{name:string;paperwork_complete:boolean;is_test?:boolean}[]) {
 const real=rows.filter(r=>!r.is_test),waiting=real.filter(r=>!r.paperwork_complete);
 return `Paperwork: ${real.length-waiting.length} Pros complete, ${waiting.length} waiting${waiting.length?` (${waiting.map(r=>r.name).join(', ')})`:''}`;
}