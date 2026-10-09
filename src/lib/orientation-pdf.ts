import blackFont from "@/assets/orientation/poppins-black.ttf.asset.json";
import mediumFont from "@/assets/orientation/poppins-medium.ttf.asset.json";
import { ORIENTATION_SECTIONS } from "@/lib/orientation";
import type { OrientationSlideData } from "@/components/pro/orientation/OrientationSlide";

const base64 = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("A deck asset could not be loaded.");
  const buffer = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  buffer.forEach(byte => { binary += String.fromCharCode(byte); });
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
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDF color preparation failed.");
    ctx.fillStyle = `hsl(${css.getPropertyValue(token)})`; ctx.fillRect(0, 0, 1, 1);
    const c = ctx.getImageData(0, 0, 1, 1).data; return [c[0], c[1], c[2]];
  };
  const ink = color("--foreground"), muted = color("--muted-foreground"), blue = color("--primary"), paper = color("--background");
  const text = (value: string, x: number, y: number, width: number, size: number, bold = false, tone = ink) => {
    pdf.setFont("Poppins", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(...tone);
    const lines = pdf.splitTextToSize(value, width); pdf.text(lines, x, y, { lineHeightFactor: 1.3 });
    return y + lines.length * size * 1.3;
  };
  for (let i = 0; i < slides.length; i++) {
    if (i) pdf.addPage([1920, 1080], "landscape");
    const { block, section } = slides[i];
    pdf.setFillColor(...paper); pdf.rect(0, 0, 1920, 1080, "F");
    text("TIDY", 90, 84, 200, 40, true, blue);
    text(`${section.title} / ${section.es}`, 310, 76, 1300, 22);
    text(`${i + 1} / ${slides.length}`, 1730, 76, 150, 22);
    const pair = Boolean(block.pair), width = pair ? 1720 : 820;
    let y = text(block.title, 90, 194, width, 68, true);
    y = text(block.body, 90, y + 26, width, pair ? 30 : 32);
    y = text(block.esTitle, 90, y + 30, width, 28, true, muted);
    text(block.es, 90, y + 18, width, pair ? 24 : 26, false, muted);
    const names = block.pair ? [`${block.pair}-R`, `${block.pair}-W`] : [block.image ?? ["PRO-1", "PRO-3", "PRO-4", "PRO-6"][ORIENTATION_SECTIONS.indexOf(section)]];
    for (let n = 0; n < names.length; n++) {
      const image = await base64(`/orientation/${names[n]}.jpg`);
      pdf.addImage(image, "JPEG", pair ? 90 + n * 885 : 1000, pair ? 545 : 220, pair ? 850 : 830, pair ? 410 : 474);
      if (pair) text(n ? "WRONG / REWORK" : "RIGHT / ACCEPT", 90 + n * 885, 995, 850, 24, true, n ? color("--destructive") : blue);
    }
    text("Images are illustrations of the standard. / Las imágenes ilustran el estándar.", 90, 1050, 1700, 18, false, muted);
  }
  pdf.setProperties({ title: "TIDY Pro orientation", author: "Tidy Home Concierge LLC" });
  return pdf.output("blob");
}