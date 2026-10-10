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
    return `@font-face{font-family:TidyOrientationPdf; font-weight:${weight};src:url(data:font/ttf;base64,${btoa(raw)}) format('truetype');}`;
  }))).join("\n");
  const fontStyle = document.createElement("style");
  const exportFontCss = fontCss + ".orientation-export, .orientation-export * {font-family:TidyOrientationPdf,sans-serif!important;}";
  fontStyle.textContent = exportFontCss; document.head.append(fontStyle);
  await Promise.all([document.fonts.load('500 32px TidyOrientationPdf'), document.fonts.load('900 68px TidyOrientationPdf')]);
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
      // html2canvas does not implement object-fit: rasterize the visible crop first,
      // rather than allowing photographs to stretch to the capture rectangle.
      for (const img of Array.from(element.querySelectorAll("img"))) {
        const css = getComputedStyle(img);
        if (!["cover", "contain"].includes(css.objectFit)) continue;
        const width = img.clientWidth, height = img.clientHeight;
        if (!width || !height || !img.naturalWidth || !img.naturalHeight) continue;
        const raster = document.createElement("canvas");
        raster.width = width; raster.height = height;
        const ctx = raster.getContext("2d");
        if (!ctx) continue;
        const ratio = css.objectFit === "cover" ? Math.max(width / img.naturalWidth, height / img.naturalHeight) : Math.min(width / img.naturalWidth, height / img.naturalHeight);
        const dw = img.naturalWidth * ratio, dh = img.naturalHeight * ratio;
        const position = css.objectPosition.split(" ").map(x => parseFloat(x) / 100);
        ctx.drawImage(img, (width - dw) * (position[0] || .5), (height - dh) * (position[1] || .5), dw, dh);
        img.src = raster.toDataURL("image/png");
        await img.decode();
      }
      // Capture the clipped reference background as artwork: canvas capture otherwise
      // ignores clip-path and paints an opaque rectangle over the slide.
      const pattern = getComputedStyle(element, "::before");
      let patternCss = "";
      if (pattern.clipPath.startsWith("polygon(") && pattern.display !== "none") {
        const w = parseFloat(pattern.width), h = parseFloat(pattern.height);
        const raster = document.createElement("canvas"); raster.width = w; raster.height = h;
        const ctx = raster.getContext("2d");
        if (ctx) {
          const points = pattern.clipPath.slice(8, -1).split(",").map(point => point.trim().split(/\s+/).map(parseFloat));
          ctx.beginPath(); points.forEach(([x,y], n) => n ? ctx.lineTo(x / 100 * w,y / 100 * h) : ctx.moveTo(x / 100 * w,y / 100 * h)); ctx.closePath(); ctx.clip();
          if (pattern.backgroundImage.includes("linear-gradient")) {
            const gradient = ctx.createLinearGradient(0,h,w,0);
            const blue = getComputedStyle(element).getPropertyValue("--orientation-blue").trim();
            gradient.addColorStop(0,`hsl(${blue} / .18)`); gradient.addColorStop(.28,`hsl(${blue} / .48)`); gradient.addColorStop(.54,`hsl(${blue})`); ctx.fillStyle = gradient;
          } else ctx.fillStyle = pattern.backgroundColor;
          ctx.fillRect(0,0,w,h);
          patternCss = `.orientation-export .orientation-slide:before{clip-path:none!important;background:transparent url(${raster.toDataURL("image/png")}) center/100% 100% no-repeat!important;}`;
        }
      }
      const canvas = await html2canvas(element, {width:1920,height:1080,scale:1,useCORS:true,logging:false,windowWidth:1920,windowHeight:1080,onclone:async doc=>{
        const style=doc.createElement("style");style.textContent=exportFontCss+patternCss+".orientation-export *, .orientation-export *:before, .orientation-export *:after {animation:none!important;transition:none!important;} .orientation-export {left:0!important;}";doc.head.append(style);
        await Promise.all([doc.fonts.load('500 32px TidyOrientationPdf'),doc.fonts.load('900 68px TidyOrientationPdf')]);
      }});
      const jpeg = canvas.toDataURL("image/jpeg",.94);
      if(i) pdf.addPage([1920,1080],"landscape");
      pdf.addImage(jpeg,"JPEG",0,0,1920,1080);
    }
    pdf.setProperties({title:"TIDY Pro orientation",author:"Tidy Home Concierge LLC"});
    return pdf.output("blob");
  } finally { root.unmount(); host.remove(); fontStyle.remove(); }
}
