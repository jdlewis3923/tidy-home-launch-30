import blackFont from "@/assets/orientation/poppins-black.ttf.asset.json";
import mediumFont from "@/assets/orientation/poppins-medium.ttf.asset.json";
import tidyLogo from "@/assets/tidy-official-logo.png";
import { orientationVisual, orientationImage } from "@/lib/orientation-design";
import type { OrientationSlideData } from "@/components/pro/orientation/OrientationSlide";

const base64 = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok || response.headers.get("content-type")?.includes("text/html")) throw new Error("A deck asset could not be loaded.");
  const buffer = new Uint8Array(await response.arrayBuffer());
  let binary = ""; buffer.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
export async function orientationPdf(slides: OrientationSlideData[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [1920, 1080], compress: true });
  const [black, medium] = await Promise.all([base64(blackFont.url), base64(mediumFont.url)]);
  pdf.addFileToVFS("Poppins-Black.ttf", black); pdf.addFont("Poppins-Black.ttf", "Poppins", "bold");
  pdf.addFileToVFS("Poppins-Medium.ttf", medium); pdf.addFont("Poppins-Medium.ttf", "Poppins", "normal");
  const css = getComputedStyle(document.documentElement);
  const color = (token: string): [number, number, number] => {
    const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("PDF preparation failed.");
    ctx.fillStyle = `hsl(${css.getPropertyValue(token)})`; ctx.fillRect(0, 0, 1, 1);
    const c = ctx.getImageData(0, 0, 1, 1).data; return [c[0], c[1], c[2]];
  };
  const images = new Map<string, HTMLImageElement>();
  const image = async (url: string) => {
    const cached = images.get(url); if (cached) return cached;
    const img = new Image(); img.src = url; await img.decode(); images.set(url, img); return img;
  };
  const logo = await image(tidyLogo);
  const place = (img: HTMLImageElement, x: number, y: number, w: number, h: number, cover = false) => {
    const canvas = document.createElement("canvas"); canvas.width = Math.round(w); canvas.height = Math.round(h);
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("PDF image preparation failed.");
    const scale = cover ? Math.max(w / img.naturalWidth, h / img.naturalHeight) : Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, w, h);
  };
  for (let i = 0; i < slides.length; i++) {
    if (i) pdf.addPage([1920, 1080], "landscape");
    const { block, section, index } = slides[i]; const visual = orientationVisual(block, section.id, index);
    const dark = visual.tone === "charcoal";
    const paper = color(`--orientation-${visual.tone === "white" ? "paper" : visual.tone}`);
    const ink = color(dark ? "--orientation-light" : "--orientation-ink");
    const muted = color(dark ? "--orientation-light-muted" : "--orientation-ink-muted");
    const accent = color(visual.tone === "blue" || dark ? "--orientation-yellow" : "--orientation-blue");
    pdf.setFillColor(...paper); pdf.rect(0, 0, 1920, 1080, "F");
    if (visual.layout === "immersive") {
      const img = await image(visual.image); const c = document.createElement("canvas"); c.width = 1920; c.height = 1080;
      const ctx = c.getContext("2d"); if (!ctx) throw new Error("PDF image preparation failed.");
      const scale = Math.max(1920 / img.naturalWidth, 1080 / img.naturalHeight);
      ctx.drawImage(img, (1920-img.naturalWidth*scale)/2, (1080-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale);
      const gradient = ctx.createLinearGradient(0,0,1920,0);
      gradient.addColorStop(0,`rgba(${paper.join(",")},.99)`); gradient.addColorStop(.44,`rgba(${paper.join(",")},.97)`); gradient.addColorStop(.8,`rgba(${paper.join(",")},.10)`);
      ctx.fillStyle = gradient; ctx.fillRect(0,0,1920,1080);
      pdf.addImage(c.toDataURL("image/jpeg",.92),"JPEG",0,0,1920,1080);
    }
    const text = (value: string, x: number, y: number, width: number, size: number, bold = false, tone = ink) => {
      pdf.setFont("Poppins", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(...tone);
      const lines = pdf.splitTextToSize(value, width); pdf.text(lines, x, y, { lineHeightFactor: 1.3 });
      return y + lines.length * size * 1.3;
    };
    place(logo,90,30,96,80); text(`${section.title} / ${section.es}`,310,76,1300,22); text(`${i+1} / ${slides.length}`,1730,76,150,22);
    pdf.setDrawColor(...accent); pdf.setLineWidth(4); pdf.line(90,132,1830,132);
    const pair = Boolean(block.pair), reverse = visual.layout === "reverse";
    const x = reverse ? 1010 : 90, width = pair ? 1740 : 820;
    // Measure all bilingual copy as a single group before positioning media.
    const measure = (value: string, size: number, bold = false) => { pdf.setFont("Poppins",bold?"bold":"normal"); pdf.setFontSize(size); return pdf.splitTextToSize(value,width).length*size*1.3; };
    let factor = 1;
    const available = pair ? 370 : 720;
    while (factor > .68 && (measure(block.title,68*factor,true)+measure(block.body,32*factor)+measure(block.esTitle,28*factor,true)+measure(block.es,26*factor)+100)>available) factor -= .04;
    let y = text(block.title,x,220,width,68*factor,true);
    y = text(block.body,x,y+22,width,32*factor);
    y = text(block.esTitle,x,y+26,width,28*factor,true,muted);
    text(block.es,x,y+16,width,26*factor,false,muted);
    if (pair) {
      for(let n=0;n<2;n++) {
        place(await image(orientationImage(`${block.pair}-${n?"W":"R"}`)),90+n*890,585,850,380,true);
        text(n?"WRONG / REWORK":"RIGHT / ACCEPT",90+n*890,1000,850,24,true,n?color(dark?"--orientation-error-light":"--orientation-error"):ink);
      }
    } else if (visual.layout !== "immersive") {
      const mx = reverse ? 90 : 1000;
      if (visual.stat) { text(visual.stat,mx,490,830,200,true); place(await image(visual.image),mx,550,830,360,true); }
      else place(await image(visual.image),mx,225,830,650);
      if(block.image === "PRO-5") text("Illustrated kit options vary by service. Car magnet optional. / Las opciones del kit varían según el servicio. Imán para auto opcional.",mx,925,830,18,false,muted);
    }
    text("Images are illustrations of the standard. / Las imágenes ilustran el estándar.",90,1050,1700,18,false,muted);
  }
  pdf.setProperties({ title: "TIDY Pro orientation", author: "Tidy Home Concierge LLC" });
  return pdf.output("blob");
}
