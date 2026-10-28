import { z } from "zod";
export const signingPhone = z.string().trim().transform(v => {
  const digits = v.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}).pipe(z.string().regex(/^\+[1-9]\d{9,14}$/));
export const signingCode = z.string().trim().regex(/^\d{6,8}$/);
export type SigningState = {
  applicant_id: string; first_name: string; service: string; pro_number: string | null;
  signed_at: string | null; active_at: string | null; mode: boolean; active: boolean; ready: boolean;
  intake_complete: boolean; intake_token: string | null; background: boolean; insurance: boolean;
  payouts: boolean; availability: boolean; sizes: boolean; agreement: boolean; w9: boolean;
  equipment: boolean; training: boolean; kit_order_ready: boolean; insurance_review: string;
  insurance_uploaded_at: string | null;
};
export const signingChecks = [
  ["background", "Background check", "Antecedentes"],
  ["insurance", "Insurance certificate", "Certificado de seguro"],
  ["payouts", "Set up pay", "Configurar pagos"],
  ["availability", "Confirm availability", "Confirmar disponibilidad"],
  ["sizes", "Kit sizes", "Tallas del kit"],
  ["w9", "W-9 received", "W-9 recibido"],
  ["equipment", "Equipment approved", "Equipo aprobado"],
  ["training", "Training completed", "Capacitación completada"],
] as const;