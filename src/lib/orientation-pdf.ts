import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import blackFont from "@/assets/orientation/poppins-black.ttf.asset.json";
import mediumFont from "@/assets/orientation/poppins-medium.ttf.asset.json";
import { OrientationSlide, type OrientationSlideData } from "@/components/pro/orientation/OrientationSlide";

export async function orientationPdf(slides: OrientationSlideData[]): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const fontCss = (await Promise.all([[blackFont.url,900],[mediumFont.url,500]].map(async ([url, weight]) => {
    const response = await fetch(String(url));
    if (!response.ok || response.headers.get("content-type")?.includes("text/html")) throw new Error("A deck font could not be loaded.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let raw = ""; bytes.forEach(b => { raw += String.fromCharCode(b); });
    return `@font-face{font-family:Poppins; font-weight:${weight};src:url(data:font/ttf;base64,${btoa(raw)}) format('truetype');}`;
  }))).join("\n");
  const host = document.createElement("div"); host.className = "orientation-app orientation-export";
  host.setAttribute("aria-hidden", "true"); document.body.append(host);
  const root = createRoot(host);
  const pdf = new jsPDF({orientation:"landscape", unit:"pt", format:[1920,1080], compress:true});
  try {
    for (let i = 0; i < slides.length; i++) {
      flushSync(() => root.render(createElement(OrientationSlide, { slide:slides[i], page:i+1, total:slides.length, exporting:true })));
      await Promise.all(Array.from(host.querySelectorAll("img")).map(img => img.decode()));
      await document.fonts.ready;
      const element = host.querySelector<HTMLElement>(".orientation-slide");
      if (!element) throw new Error("Slide unavailable.");
      const canvas = await html2canvas(element, {width:1920,height:1080,scale:1,useCORS:true,logging:false,windowWidth:1920,windowHeight:1080,onclone:doc=>{
        const style=doc.createElement("style");style.textContent=fontCss+".orientation-export *, .orientation-export *:before, .orientation-export *:after {animation:none!important;transition:none!important;} .orientation-export {left:0!important;}";doc.head.append(style);
      }});
      const jpeg = canvas.toDataURL("image/jpeg",.94);
      if(i) pdf.addPage([1920,1080],"landscape");
      pdf.addImage(jpeg,"JPEG",0,0,1920,1080);
    }
    pdf.setProperties({title:"TIDY Pro orientation",author:"Tidy Home Concierge LLC"});
    return pdf.output("blob");
  } finally { root.unmount(); host.remove(); }
}
