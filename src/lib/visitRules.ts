// "How visits work" — the plain-language rules shown to customers (Account page,
// /terms and next to the scope checkbox). Policy copy, not service scope.
// Liability wording for damage claims is pending legal review: no payout or
// dollar limit may be promised here.
import { MEMBER_GUIDE } from './memberGuide';

const guideText = (id: typeof MEMBER_GUIDE[number]['id'], lang:'en'|'es') => MEMBER_GUIDE.find(s=>s.id===id)?.[lang].items.join(' ') ?? '';
export const VISIT_RULES: Array<{ en: [string, string]; es: [string, string] }> = [
  { en: ["Size is checked", "Tidy verifies cleaning square feet and bathrooms before payment. Lawn turf is measured before payment; vehicle size is recorded at the first visit. Nothing is repriced without your approval. Founding members keep their locked rates."],
    es: ["Revisamos el tamaño", "Tidy verifica los pies cuadrados y baños de la casa antes de cobrar. Medimos el césped antes del pago; el tamaño del auto se registra en la primera visita. Ningún precio aumenta sin tu aprobación. Los miembros fundadores mantienen sus tarifas fijas."] },
  { en: ["No deals at the door", "Extra work is requested in the app as an add-on and charged only after you approve it. Pros can't add work, accept cash or promise anything free."],
    es: ["Nada de tratos en la puerta", "El trabajo extra se pide en la app como servicio adicional y solo se cobra después de que usted lo apruebe. Los Pros no pueden agregar trabajo, aceptar efectivo ni prometer nada gratis."] },
  { en: ["A first visit on a home or lawn that's been let go", "The first visit is a standard visit in your booked size. Cleaning goes in this order: kitchen, bathrooms, floors, dusting. Anything not reached is photographed and listed on your visit report, and you're offered add-ons or a size-up. It doesn't count as a missed item for a redo. A lawn over about 6 inches is cut down safely; the next visit brings it to normal height."],
    es: ["Primera visita en una casa o jardín descuidado", "La primera visita es una visita estándar del tamaño reservado. La limpieza sigue este orden: cocina, baños, pisos y polvo. Lo que no se alcance se fotografía y se anota en el reporte, y le ofrecemos servicios adicionales o un plan más grande. No cuenta como algo omitido para pedir que regresemos. Un césped de más de unas 6 pulgadas se corta con seguridad; la siguiente visita lo deja a la altura normal."] },
  { en: ["If we can't get in", guideText('lockout','en')],
    es: ["Si no podemos entrar", guideText('lockout','es')] },
  { en: ["Unsafe = your Pro may stop", "An aggressive person or animal, an active pest infestation, a biohazard, exposed wiring, flooding or lightning: your Pro stops, takes photos and leaves. It's handled the same way as no access."],
    es: ["Si no es seguro, su Pro puede detenerse", "Una persona o animal agresivo, una plaga activa, un riesgo biológico, cables expuestos, inundación o rayos: su Pro se detiene, toma fotos y se retira. Se maneja igual que una visita sin acceso."] },
  { en: ["Weather", guideText('weather','en')],
    es: ["Clima", guideText('weather','es')] },
  { en: ["Rescheduling, skipping and pausing", guideText('rescheduling','en')],
    es: ["Reprogramar, saltar y pausar", guideText('rescheduling','es')] },
  { en: ["Redos cover what's included", "Tap \"Something wasn't right\" within 48 hours of the visit and pick which included items were missed. Items on the Not included list can't be picked. A photo helps. We come back within 48 hours, free."],
    es: ["El regreso cubre lo incluido", "Toque «Algo no quedó bien» dentro de las 48 horas posteriores a la visita y elija qué cosas incluidas faltaron. Lo que aparece como No incluido no se puede elegir. Una foto ayuda. Regresamos dentro de 48 horas, gratis."] },
  { en: ["Damage", "Report damage in the app within 24 hours of the visit, with photos. Pre-existing damage is whatever shows in your Pro's first-visit and before photos. Tidy isn't responsible for items you were asked to put away and didn't, for normal wear, or for damage already in the photos."],
    es: ["Daños", "Reporte cualquier daño en la app dentro de las 24 horas posteriores a la visita, con fotos. El daño previo es el que aparece en las fotos de la primera visita y en las fotos de antes. Tidy no es responsable de objetos que se le pidió guardar y no guardó, del desgaste normal ni de daños que ya aparecen en las fotos."] },
  { en: ["Photos close every visit", "Your Pro takes before and after photos and checks in and out with GPS on every visit. For cars, the four corners and the front and rear interior are photographed before anything is touched."],
    es: ["Las fotos cierran cada visita", "Su Pro toma fotos de antes y después y registra su llegada y salida con GPS en cada visita. En los autos, se fotografían las cuatro esquinas y el interior delantero y trasero antes de tocar nada."] },
];
