export const POSITIONS: Record<string,string> = { cleaning:'House Cleaning Pro', lawn:'Lawn Care Pro', detailing:'Car Care Pro' };
export type DocumentStatus = { documentId:number; status:string; signedAt?:number; expiresAt?:number };
export function paperworkState(rows:DocumentStatus[], ids:{w9:number;coi:number;agreement:number}, now=Date.now()) {
  const find=(id:number)=>rows.find(r=>r.documentId===id);
  const w9=find(ids.w9),coi=find(ids.coi),agreement=find(ids.agreement);
  const accepted=(r:DocumentStatus|undefined)=>!!r&&['approved','completed'].includes(r.status);
  const signed=!!agreement?.signedAt&&agreement.signedAt>0;
  const expiry=coi?.expiresAt ? new Date(coi.expiresAt*1000).toISOString():null;
  const coiApproved=accepted(coi)&&(!expiry||Date.parse(expiry)>now);
  return { status:{w9:w9?.status??'notAssigned',coi:coi?.status??'notAssigned',agreement:agreement?.status??'notAssigned'},complete:accepted(w9)&&coiApproved&&accepted(agreement)&&signed,signedAt:signed?new Date(Number(agreement?.signedAt)*1000).toISOString():null,expiry,coiApproved };
}
export function paperworkDigest(rows:{name:string;paperwork_complete:boolean;is_test?:boolean}[]) {
 const real=rows.filter(r=>!r.is_test),waiting=real.filter(r=>!r.paperwork_complete);
 return `Paperwork: ${real.length-waiting.length} Pros complete, ${waiting.length} waiting${waiting.length?` (${waiting.map(r=>r.name).join(', ')})`:''}`;
}