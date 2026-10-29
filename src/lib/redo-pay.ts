export const REDO_PAY_DAYS = 60;
export const REDO_PAY_EN = 'Return within 48 hours to fix a reported problem. One redo per member every 60 days pays 50% of the original visit rate. Further redos within 60 days of the last paid redo are required and unpaid. Members are never charged.';
export const REDO_PAY_ES = 'Regrese dentro de 48 horas para corregir un problema reportado. Un regreso por miembro cada 60 días paga el 50% de la tarifa de la visita original. Los siguientes regresos dentro de 60 días del último regreso pagado son obligatorios y sin pago. El miembro nunca paga.';
export function redoPayCents(originalRateCents:number,lastPaidRedoAt:Date|null,completedAt:Date){
 const eligible=!lastPaidRedoAt||completedAt.getTime()-lastPaidRedoAt.getTime()>=REDO_PAY_DAYS*86400000;
 return eligible?Math.round(originalRateCents/2):0;
}