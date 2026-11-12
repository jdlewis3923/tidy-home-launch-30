import {buildPaperworkEmail,paperworkSteps} from './paperwork-email.ts';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
/** One email: finish-profile link first, then only the Connecteam documents still open (agreement → W-9 → COI). */
export function buildFinishProfileEmail(p:{first:string;service:string;status:Record<string,string>;signed:boolean;coiValid:boolean;link:string}){
 const subject='Finish your Tidy profile — 2 minutes';
 const message=`Hi ${p.first}, you're almost set! Please finish your Tidy profile (vest size, badge name, photo ID and badge photo) so we can order your kit, then sign the documents below. You won't be asked for anything you've already given us.`;
 const labels:Record<string,string>={agreement:'Sign your Independent Contractor Agreement',w9:'Sign your W-9',coi:'Upload your Certificate of Insurance'};
 const steps=paperworkSteps(p.service,p.status,p.signed,p.coiValid).filter(s=>!s.done&&labels[s.key]);
 const btn=(url:string,label:string)=>`<p style="margin:20px 0"><a href="${esc(url)}" style="display:block;text-align:center;background:#f5c518;color:#0f172a;padding:18px 20px;text-decoration:none;font-weight:700;border-radius:6px">${esc(label)}</a></p>`;
 const content=`<p style="font-size:16px;line-height:1.65">${esc(message)}</p>${btn(p.link,'Finish your Tidy profile')}${steps.map(s=>btn(s.url,labels[s.key])).join('')}${steps.some(s=>s.key==='coi')?'<p>Tidy pays back $50/month for your first 3 months of insurance.</p>':''}`;
 const base=buildPaperworkEmail({...p,phone:''},'welcome');
 return {subject,html:base.html.replace(/<h1 style="font-size:26px">[\s\S]*?(?=<\/td>)/,content),text:`${message}\n\nFinish your Tidy profile: ${p.link}\n${steps.map(s=>`${labels[s.key]}: ${s.url}`).join('\n')}`,keys:['profile',...steps.map(s=>s.key)]};
}
