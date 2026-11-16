// Pure rules for the Connecteam photo push (testable without Deno).
export const PHOTO_DOC_ID=841237;
export const MAX_PHOTO_ATTEMPTS=10;
/** Hourly for the first 3 tries, then daily (the document appears once Connecteam assigns the Position pack). */
export const retryDelayMs=(attempts:number)=>attempts<3?50*60e3:23*3600e3;
export function buildBadgeEmail(p:{name:string;service:string;badge:string;vest:string;links:Record<string,string>;adminUrl:string}){
 const row=(l:string,v:string)=>`<tr><td style="padding:6px 12px;color:#64748b">${l}</td><td style="padding:6px 12px;font-weight:600;color:#0f172a">${v}</td></tr>`;
 const subject=`Badge ready: ${p.badge} (${p.service})`;
 const html=`<div style="font-family:Poppins,Arial,sans-serif;max-width:560px;margin:auto;padding:24px"><h2 style="color:#0f172a">Badge ready to order</h2><table>${row('Pro',p.name)}${row('Service',p.service)}${row('Badge name',p.badge)}${row('Vest size',p.vest)}</table>
 <p>${p.links.badge_photo?`<a href="${p.links.badge_photo}" style="color:#2563eb">Badge photo</a>`:'Badge photo missing'} · ${p.links.photo_id?`<a href="${p.links.photo_id}" style="color:#2563eb">Photo ID</a>`:'Photo ID missing'} (links valid 30 days; both attached)</p>
 <p><a href="${p.adminUrl}" style="background:#f5c518;color:#0f172a;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open in admin</a></p></div>`;
 return {subject,html};
}

