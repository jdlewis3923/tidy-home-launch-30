import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';
import { TIDY_LOGO } from './email-brand.ts';
import { vendorFetch } from './http.ts';
import { CONTRACT_FONT_BASE64 } from './contract-font.ts';

export const fillContract = (text: string, values: Record<string,string>) => text.replace(/\{(\w+)\}/g, (match,key) => values[key] ?? match);
export const etTime = (date: Date) => date.toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'long',timeStyle:'short'})+' ET';
export async function agreementPdf(body: string, values: Record<string,string>, evidence?: Record<string,string>, original?: Uint8Array) {
  const pdf = original ? await PDFDocument.load(original) : await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(Uint8Array.from(atob(CONTRACT_FONT_BASE64),c=>c.charCodeAt(0)));
  const logoResponse=await vendorFetch(TIDY_LOGO);
  if(!logoResponse.ok) throw new Error('Tidy logo unavailable');
  const logo=await pdf.embedPng(await logoResponse.arrayBuffer());
  let page=pdf.addPage([612,792]);let y=680;
  const newPage=()=>{page=pdf.addPage([612,792]);y=740;};
  page.drawImage(logo,{x:48,y:695,width:78,height:65});
  const write=(text:string,size=10)=>{
    for(const paragraph of text.split(/\n/)){
      let line='';
      for(const word of paragraph.split(/\s+/)){
        const next=line?`${line} ${word}`:word;
        if(font.widthOfTextAtSize(next,size)>516 && line){if(y<50)newPage();page.drawText(line,{x:48,y,size,font});y-=size+5;line=word;}else line=next;
      }
      if(line){if(y<50)newPage();page.drawText(line,{x:48,y,size,font});y-=size+5;}
      y-=6;
    }
  };
  if(!original)write(fillContract(body,values));
  if(evidence){newPage();write('Signature page',17);write(Object.entries(evidence).map(([k,v])=>`${k}: ${v}`).join('\n'),10);}
  return await pdf.save();
}