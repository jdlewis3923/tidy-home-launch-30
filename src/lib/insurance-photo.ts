import { jsPDF } from "jspdf";
/** Keep the existing private PDF-only storage and review path for phone photos. */
export async function insurancePdf(file: File): Promise<Blob> {
  if(file.type==="application/pdf") return file;
  const image=await createImageBitmap(file);
  const scale=Math.min(1,2000/Math.max(image.width,image.height));
  const canvas=document.createElement("canvas");canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const context=canvas.getContext("2d");if(!context)throw new Error("Photo could not be read");
  context.drawImage(image,0,0,canvas.width,canvas.height);image.close();
  const pdf=new jsPDF({orientation:canvas.width>canvas.height?"landscape":"portrait",unit:"px",format:[canvas.width,canvas.height]});
  pdf.addImage(canvas.toDataURL("image/jpeg",.9),"JPEG",0,0,canvas.width,canvas.height);
  return pdf.output("blob");
}