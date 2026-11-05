const text=(v:unknown):string=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
const label=(k:string,v:unknown)=>text(v)?`${k}: ${text(v)}`:'';
export function memberJobNotes(service:string,p:any,sub:any,home:any,car:any,preferred:string,window:string){
 const common=[label('Arrival window',window),label('Parking',p?.parking_notes),label('Pets',p?.pets),label('Member preferences',p?.special_instructions),label('Preferred Pro',preferred)];
 if(service==='cleaning'){common.push(label('Home notes',home?.body));for(const [k,v] of Object.entries(home?.profile??{}))common.push(label(`Home — ${k.replace(/_/g,' ')}`,Array.isArray(v)?v.join(', '):v));}
 if(service==='lawn')common.push(label('Measured turf sq ft',sub?.lawn_measured_sqft));
 if(service==='detailing')common.push(label('Vehicle',[car?.vehicle_make,car?.vehicle_model,car?.vehicle_color].filter(Boolean).join(' ')),label('Plate',car?.vehicle_plate),label('Vehicle parking',car?.parking_spot),label('Interior access',car?.interior_access),car?.interior_included===false?'Interior: not included':'',car?.spigot_at_parking===true?'Spigot at parking: Yes':car?.spigot_at_parking===false?'Spigot at parking: No':'',label('Vehicle access note',car?.access_note));
 return [...common,'Pro: fill the Tidy Visit Report in Connecteam before you leave.'].filter(Boolean).join('\n');
}
export function shiftAccessNotes(code:string|null){return code?`Gate code: ${code}`:'';}
