export type ContractBlock = { kind: 'paragraph'|'heading'; text:string } | {kind:'table'; rows:string[][]};
export function contractBlocks(body:string):ContractBlock[] {
  // Add presentation boundaries only; never replace a word or punctuation mark.
  const text=body.replace(/\s+(?=\d+\.\d+\s)/g,'\n\n').replace(/\s+(?=\d+\. [A-Z])/g,'\n\n').replace(/\s+(?=SCHEDULE [AB] —|SIGNATURES|Contractor:|Effective date:|Tidy and Contractor agree|Tidy Home Concierge LLC, a Florida)/g,'\n\n').replace(/(SCHEDULE A — PAY)\s+/g,'$1\n\n').replace(/(SCHEDULE B — THE TIDY STANDARD: LAWN CARE)\s+/g,'$1\n\n').replace(/(SIGNATURES)\s+/g,'$1\n\n');
  const blocks:ContractBlock[]=[];
  for(const part of text.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean)) {
    if(part.includes('|')) {
      // The lawn paste has flattened rows: recognize each row without altering its cells.
      const lines=part.replace(/\s+(?=Small\s+\||Standard\s+\||Large\s+\||Member price shown|Yards over|Weed Removal — Garden Beds\s*\||Leaf & Debris Cleanup\s*\||Bed Edge Reset\s*\||Exterior Windows & Screens\s*\||Driveway Pressure Wash\s*\||Contractor may decline)/g,'\n').split('\n').map(l=>l.trim()).filter(Boolean);
      let rows:string[][]=[];
      for(const line of lines){if(line.includes('|')) rows.push(line.split('|').map(c=>c.trim()));else{if(rows.length){blocks.push({kind:'table',rows});rows=[];}blocks.push({kind:'paragraph',text:line});}}
      if(rows.length)blocks.push({kind:'table',rows});
    } else blocks.push({kind:/^\d+\. [A-Z]|^SCHEDULE|^SIGNATURES|^INDEPENDENT CONTRACTOR AGREEMENT/.test(part)?'heading':'paragraph',text:part});
  }
  return blocks;
}
export const fillContract = (text:string,values:Record<string,string>)=>text.replace(/\{(\w+)\}/g,(m,k)=>values[k]??m);