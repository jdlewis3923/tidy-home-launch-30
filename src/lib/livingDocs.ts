// Living company documents. Every figure and list here is READ from a source of
// truth (pricing-canon, addon-catalog, proKit, redo-pay, reviewBonus, orientation,
// and the live service_scope / contract_templates rows passed in). No document
// text is stored or uploaded; company_documents only receives a searchable copy.
import {
  CLEANING_BANDS, CLEANING_BASE_PAY, CLEANING_MONTHLY, CONTRACTOR_VISIT_PAY, CONTRACTOR_SHINE_PAY,
  DEEP_CLEAN_PRICE, DEEP_CLEAN_PRO_PAY_PCT, ESTATE_FIRST_VISIT_MULTIPLIER, TIER_2_UPLIFT,
  REFERRAL_BONUS_CENTS, CAR_WASH_PRICES, type CleaningSize,
} from "@/lib/pricing-canon";
import { ADDON_CATALOG, type AddonService } from "@/lib/addon-catalog";
import { KIT_BY_SERVICE, kitContentsLine, VEST_SIZES, MAGNET_CREDIT_MONTHLY_USD, type KitServiceKey } from "@/lib/proKit";
import { REDO_PAY_DAYS } from "@/lib/redo-pay";
import { REVIEW_BONUS_CENTS } from "@/lib/reviewBonus";
import { ORIENTATION_SECTIONS } from "@/lib/orientation";
import type { ScopeRow, ScopeService } from "@/lib/serviceScope";

export type Lang = "en" | "es";
export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };
export type DocSection = { heading: string; blocks: DocBlock[] };
export type LivingDoc = { slug: string; title: string; sections: DocSection[] };
export type ContractRow = { service: string; lang: string; version: string; body: string; created_at: string; is_current: boolean };
export type DocSources = { scope: ScopeRow[]; contracts: ContractRow[] };

export const SUPPORT_PHONE = "(786) 829-1141";
export const SUPPORT_EMAIL = "hello@jointidy.co";
const LOCKOUT_PCT = 50;
const INSURANCE_HELP = { monthly: 50, months: 3 };
const TIER2 = { visits: 50, rating: 4.8, days: 60 };
const GIFT_MAX = 55;

type Svc = "cleaning" | "lawn" | "car";
const SVC_NAME: Record<Svc, [string, string]> = {
  cleaning: ["House Cleaning", "Limpieza del hogar"], lawn: ["Lawn Care", "Cuidado del césped"], car: ["Car Care", "Cuidado del Auto"],
};
const ADDON_SVC: Record<Svc, AddonService> = { cleaning: "cleaning", lawn: "lawn", car: "detailing" };
const SCOPE_SVC: Record<Svc, ScopeService[]> = { cleaning: ["cleaning"], lawn: ["lawn"], car: ["car_wash", "car_detail"] };
const KIT_SVC: Record<Svc, KitServiceKey> = { cleaning: "cleaning", lawn: "lawn", car: "car" };

const $ = (n: number) => `$${Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2)}`;
const p = (text: string): DocBlock => ({ kind: "p", text });
const list = (items: string[]): DocBlock => ({ kind: "list", items });
const table = (head: string[], rows: (string | number)[][]): DocBlock => ({ kind: "table", head, rows: rows.map((r) => r.map(String)) });
const sec = (heading: string, ...blocks: DocBlock[]): DocSection => ({ heading, blocks });
const T = (l: Lang) => (en: string, es: string) => (l === "en" ? en : es);

// ---------- shared builders ----------
function scopeSections(src: DocSources, svc: Svc, l: Lang): DocSection[] {
  const t = T(l);
  const rows = src.scope.filter((r) => r.active && SCOPE_SVC[svc].includes(r.service) && !r.addon_key);
  const included = rows.filter((r) => r.section === "included");
  const groups = new Map<string, string[]>();
  for (const r of included.sort((a, b) => a.sort_order - b.sort_order)) {
    const g = (l === "en" ? r.group_en : r.group_es) || t("Every visit", "Cada visita");
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(l === "en" ? r.text_en : r.text_es);
  }
  const out: DocSection[] = [...groups].map(([g, items]) => sec(`${t("Scope", "Alcance")} · ${g}`, list(items)));
  const notInc = rows.filter((r) => r.section === "not_included").map((r) => (l === "en" ? r.text_en : r.text_es));
  if (notInc.length) out.push(sec(t("Not included", "No incluye"), list(notInc)));
  if (!out.length) out.push(sec(t("Scope", "Alcance"), p(t("No active scope rows were found.", "No se encontraron filas de alcance activas."))));
  return out;
}

function deepCleanRows(src: DocSources, l: Lang): string[] {
  return src.scope.filter((r) => r.active && r.service === "cleaning_deep_clean" && r.section === "included" && !/^everything in/i.test(r.text_en))
    .sort((a, b) => a.sort_order - b.sort_order).map((r) => (l === "en" ? r.text_en : r.text_es));
}

function cleaningPayTable(l: Lang): DocBlock {
  const t = T(l);
  return table(
    [t("Size", "Tamaño"), t("Home", "Casa"), t("Pro pay per visit", "Pago al Pro por visita"), t("First visit", "Primera visita")],
    CLEANING_BANDS.map((b) => {
      const pay = CLEANING_BASE_PAY[b.size as CleaningSize];
      const first = b.size >= 4 ? $(pay * ESTATE_FIRST_VISIT_MULTIPLIER) : "—";
      const label = b.size === 5 ? `${$(pay)} ${t("per team visit (2 Pros, " + $(pay / 2) + " each)", "por visita de equipo (2 Pros, " + $(pay / 2) + " c/u)")}` : $(pay);
      return [b.name, b.range.replace("Up to", t("Up to", "Hasta")), label, first];
    }).concat([[t("Over 7,000", "Más de 7,000"), t("Walkthrough first", "Visita previa"), t("Set in writing", "Fijado por escrito"), "—"]]),
  );
}

function payExtras(l: Lang, svc: Svc): DocBlock {
  const t = T(l);
  return list([
    t("Paid every Friday by direct deposit through Stripe.", "Pago cada viernes por depósito directo a través de Stripe."),
    t("Pay is the same on monthly, every-two-weeks and weekly plans.", "El pago es igual en planes mensuales, quincenales y semanales."),
    t(`Add-ons pay ${DEEP_CLEAN_PRO_PAY_PCT}% of the member price, including add-ons Tidy gives members as a gift.`, `Los adicionales pagan ${DEEP_CLEAN_PRO_PAY_PCT}% del precio al miembro, incluso los que Tidy regala.`),
    ...(svc === "cleaning" ? [t(`Deep Clean pays ${DEEP_CLEAN_PRO_PAY_PCT}%: ${Object.values(DEEP_CLEAN_PRICE).map((v) => $(v * DEEP_CLEAN_PRO_PAY_PCT / 100)).join(" / ")}.`, `Limpieza profunda paga ${DEEP_CLEAN_PRO_PAY_PCT}%: ${Object.values(DEEP_CLEAN_PRICE).map((v) => $(v * DEEP_CLEAN_PRO_PAY_PCT / 100)).join(" / ")}.`)] : []),
    t(`Tier 2: +${Math.round((TIER_2_UPLIFT - 1) * 100)}% at ${TIER2.visits}+ visits, a ${TIER2.rating}+ rating and ${TIER2.days}+ days.`, `Nivel 2: +${Math.round((TIER_2_UPLIFT - 1) * 100)}% con ${TIER2.visits}+ visitas, calificación ${TIER2.rating}+ y ${TIER2.days}+ días.`),
    t(`${$(REVIEW_BONUS_CENTS / 100)} per five-star Google review that names you (one per member).`, `${$(REVIEW_BONUS_CENTS / 100)} por cada reseña de Google de cinco estrellas que te nombre (una por miembro).`),
    t(`${$(INSURANCE_HELP.monthly)} a month back on insurance for your first ${INSURANCE_HELP.months} months.`, `${$(INSURANCE_HELP.monthly)} al mes de reembolso del seguro durante tus primeros ${INSURANCE_HELP.months} meses.`),
    t(`${LOCKOUT_PCT}% of the visit rate on a verified lockout or a member cancel under 24 hours.`, `${LOCKOUT_PCT}% de la tarifa de la visita por un bloqueo verificado o una cancelación con menos de 24 horas.`),
    t(`Redo: one redo per member every ${REDO_PAY_DAYS} days pays 50% of the visit rate. Further redos for that member inside the ${REDO_PAY_DAYS} days pay $0 and alert Justin.`, `Regreso: un regreso por miembro cada ${REDO_PAY_DAYS} días paga el 50% de la tarifa. Los siguientes dentro de esos ${REDO_PAY_DAYS} días pagan $0 y avisan a Justin.`),
  ]);
}

function payTableFor(svc: Svc, l: Lang): DocBlock {
  const t = T(l);
  if (svc === "cleaning") return cleaningPayTable(l);
  if (svc === "lawn") return table([t("Size", "Tamaño"), t("Pro pay per visit", "Pago al Pro por visita")],
    ([1, 2, 3] as const).map((s) => [[t("Small", "Pequeño"), t("Standard", "Estándar"), t("Large", "Grande")][s - 1], $(CONTRACTOR_VISIT_PAY.lawn[s].monthly)]));
  return table([t("Vehicle", "Vehículo"), t("Wash", "Lavado"), t("Full detail", "Detallado completo")],
    ([1, 2, 3] as const).map((s) => [[t("Sedan / coupe", "Sedán / cupé"), t("SUV / crossover", "SUV / crossover"), t("Truck, 3-row or van", "Camioneta, 3 filas o van")][s - 1], $(CONTRACTOR_SHINE_PAY[s].maintenanceWash), $(CONTRACTOR_SHINE_PAY[s].fullDetail)]));
}

function addonTable(svc: Svc, l: Lang): DocBlock {
  const t = T(l);
  const rows: string[][] = [];
  if (svc === "cleaning") {
    for (const b of CLEANING_BANDS) rows.push([`${t("Deep Clean", "Limpieza profunda")} · ${b.name}`, $(DEEP_CLEAN_PRICE[b.size as CleaningSize]), $(DEEP_CLEAN_PRICE[b.size as CleaningSize] * DEEP_CLEAN_PRO_PAY_PCT / 100), t("No", "No")]);
  }
  for (const a of ADDON_CATALOG.filter((x) => x.service === ADDON_SVC[svc])) {
    rows.push([a.name, $(a.price), $(a.price * 0.4), a.giftEligible ? t("Yes", "Sí") : t("No", "No")]);
  }
  return table([t("Add-on", "Adicional"), t("Member price", "Precio al miembro"), t("Pro pay (40%)", "Pago al Pro (40%)"), t("Gift-eligible", "Puede ser regalo")], rows);
}

function kitSection(l: Lang, svc?: Svc): DocSection {
  const t = T(l);
  const svcs: Svc[] = svc ? [svc] : ["cleaning", "lawn", "car"];
  return sec(t("Vests and badge", "Chalecos y credencial"),
    table([t("Service", "Servicio"), t("Tidy provides, free", "Tidy entrega, gratis")], svcs.map((s) => [SVC_NAME[s][l === "en" ? 0 : 1], kitContentsLine(KIT_SVC[s], l)])),
    list([
      t("Navy vests are premium, lightweight, not mesh, with an embroidered logo. Lawn vests are hi-vis.", "Los chalecos azul marino son premium, livianos, no de malla, con logo bordado. Los de césped son de alta visibilidad."),
      t("Vests are optional and worn over your own clothes. No polos, no tees, no names on garments.", "Los chalecos son opcionales y van sobre tu propia ropa. Sin polos, sin camisetas, sin nombres en la ropa."),
      t("The photo ID badge clips to the vest so members know who is at the door.", "La credencial con foto va en el chaleco para que el miembro sepa quién llegó."),
      t(`Vest sizes: ${VEST_SIZES.join(", ")}.`, `Tallas de chaleco: ${VEST_SIZES.join(", ")}.`),
      t(`Vehicle magnets are optional, with a ${$(MAGNET_CREDIT_MONTHLY_USD)}/month credit under a separate agreement.`, `Los imanes del vehículo son opcionales, con un crédito de ${$(MAGNET_CREDIT_MONTHLY_USD)}/mes bajo un acuerdo aparte.`),
    ]));
}

function contactSection(l: Lang): DocSection {
  const t = T(l);
  return sec(t("Contact", "Contacto"), list([`${t("Phone / text", "Teléfono / texto")}: ${SUPPORT_PHONE}`, `${t("Email", "Correo")}: ${SUPPORT_EMAIL}`]));
}

function redoSection(l: Lang): DocSection {
  const t = T(l);
  return sec(t("Redo rule", "Regla de regreso"), list([
    t("The member taps \"Something wasn't right\" and we return within 48 hours, free.", "El miembro toca \"Algo no quedó bien\" y volvemos en 48 horas, gratis."),
    t(`The Pro is paid 50% of the visit rate for ONE redo per member every ${REDO_PAY_DAYS} days.`, `El Pro cobra el 50% de la tarifa por UN regreso por miembro cada ${REDO_PAY_DAYS} días.`),
    t(`Further redos for that member inside the ${REDO_PAY_DAYS} days pay $0, are still required, and alert Justin.`, `Los siguientes regresos dentro de esos ${REDO_PAY_DAYS} días pagan $0, siguen siendo obligatorios y avisan a Justin.`),
    t("A redo is always the fix. It is never replaced with an account credit.", "El regreso siempre es la solución. Nunca se reemplaza con saldo a favor."),
  ]));
}

function lockoutSection(l: Lang): DocSection {
  const t = T(l);
  return sec(t("Lockouts and late cancels", "Bloqueos y cancelaciones tardías"), list([
    t("Can't get in? Call or text the member through the app, wait 15 minutes, photo the door, then tap Lockout.", "¿No puedes entrar? Llama o escribe al miembro desde la app, espera 15 minutos, toma foto de la puerta y toca Bloqueo."),
    t(`A verified lockout or a member cancel under 24 hours pays ${LOCKOUT_PCT}% of the visit rate.`, `Un bloqueo verificado o una cancelación con menos de 24 horas paga ${LOCKOUT_PCT}% de la tarifa.`),
  ]));
}

function accessSection(l: Lang, svc: Svc): DocSection {
  const t = T(l);
  return sec(t("Keys, codes, alarms and pets", "Llaves, códigos, alarmas y mascotas"), list([
    t("Access codes show only to the assigned Pro, from 30 minutes before the window until check-out.", "Los códigos solo los ve el Pro asignado, desde 30 minutos antes de la ventana hasta la salida."),
    t("Never share or write down codes. Lock up, set the alarm and leave lights and AC as found.", "Nunca compartas ni anotes códigos. Cierra con llave, activa la alarma y deja luces y aire como estaban."),
    svc === "lawn" ? t("Close every gate behind you. Loose dog or locked gate: contact Tidy before leaving. Pet-waste areas are skipped and photographed.", "Cierra cada portón. ¿Perro suelto o portón cerrado? Contacta a Tidy antes de irte. Las áreas con desechos de mascotas se omiten y se fotografían.")
      : t("Follow the pet notes on the job card. Never let a pet out.", "Sigue las notas de mascotas de la tarjeta. Nunca dejes salir a una mascota."),
  ]));
}

function profileSection(l: Lang): DocSection {
  const t = T(l);
  return sec(t("Home profile, photos and check-out", "Perfil de la casa, fotos y salida"), list([
    t("Read the home profile and member notes on the job card before you start. Your name shows to the member above the access notes.", "Lee el perfil de la casa y las notas del miembro antes de empezar. Tu nombre aparece al miembro arriba de las notas de acceso."),
    t("Check in and out in the app; location is recorded only at check-in and check-out.", "Registra entrada y salida en la app; la ubicación se guarda solo en esos momentos."),
    t("Take the required before-and-after photos. Photos never show people or papers.", "Toma las fotos de antes y después. Las fotos nunca muestran personas ni papeles."),
    t("Tap Finish Job to complete the checklist and photos.", "Toca Terminar trabajo para completar la lista y las fotos."),
  ]));
}

function insuranceSection(l: Lang): DocSection {
  const t = T(l);
  return sec(t("Insurance", "Seguro"), list([
    t("General liability: $1,000,000 per occurrence and $2,000,000 aggregate, with Tidy Home Concierge LLC as additional insured (address on the insurance page in the app).", "Responsabilidad civil general: $1,000,000 por incidente y $2,000,000 en agregado, con Tidy Home Concierge LLC como asegurado adicional (dirección en la página de seguro de la app)."),
    t("Quotes run about $25–60 a month. Upload the certificate in the app.", "Las cotizaciones son de unos $25–60 al mes. Sube el certificado en la app."),
    t(`Tidy pays ${$(INSURANCE_HELP.monthly)} a month back for your first ${INSURANCE_HELP.months} months with Friday pay.`, `Tidy te devuelve ${$(INSURANCE_HELP.monthly)} al mes durante tus primeros ${INSURANCE_HELP.months} meses con el pago del viernes.`),
  ]));
}

function deepCleanSection(src: DocSources, l: Lang): DocSection {
  const t = T(l);
  return sec(t("Deep Clean add-on", "Limpieza profunda adicional"),
    p(t("Everything in the visit, plus:", "Todo lo de la visita, más:")),
    list(deepCleanRows(src, l)),
    list([
      t("Adds time to the visit. One after-photo for each of the 6 items is required to finish.", "Agrega tiempo a la visita. Se requiere una foto final por cada uno de los 6 puntos para terminar."),
      t("Never a free gift. In Estate homes, baseboards, blinds, fans and walls are sold only inside Deep Clean.", "Nunca es un regalo. En casas Estate, zócalos, persianas, ventiladores y paredes solo se venden dentro de la Limpieza profunda."),
      t("Weekly cleaning plans get a quarterly deep clean every 13th week.", "Los planes semanales incluyen una limpieza profunda trimestral cada 13.ª semana."),
      t("Never offered: a one-time clean without a plan, move-in or move-out, post-construction.", "Nunca se ofrece: limpieza única sin plan, mudanza de entrada o salida, ni post-construcción."),
    ]));
}

function windowsSection(l: Lang, svc: Svc): DocSection {
  const t = T(l);
  if (svc === "lawn") return sec(t("Visit flow", "Flujo de la visita"), list([
    t("Routes are set by street. Each yard is cut on its scheduled day.", "Las rutas se arman por calle. Cada jardín se corta en su día."),
    t("Rain-outs move to the Friday catch-up day with at least 24 hours' notice.", "Los días de lluvia pasan al viernes de recuperación con al menos 24 horas de aviso."),
    t("Clippings are mulched back into the lawn, never left in the street, gutters or drains.", "La grama cortada se tritura y queda en el césped, nunca en la calle, cunetas o desagües."),
  ]));
  if (svc === "car") return sec(t("Visit flow", "Flujo de la visita"), list([
    t("Confirm water and parking notes on the job card before you start.", "Confirma las notas de agua y estacionamiento antes de empezar."),
    t("Maintenance wash is an exterior wash plus interior clean, not a detail. Full details happen twice a year.", "El lavado de mantenimiento es exterior más limpieza interior, no un detallado. Los detallados completos son dos veces al año."),
  ]));
  return sec(t("Visit flow", "Flujo de la visita"), list([
    t("Arrival windows: 8–10 AM, 11 AM–1 PM or 2–4 PM. Estate homes take the morning and midday windows.", "Ventanas: 8–10 AM, 11 AM–1 PM o 2–4 PM. Las casas Estate usan las ventanas de la mañana y del mediodía."),
    t("Estate Plus homes are always two Pros, with a Lead who does the final inspection.", "Las casas Estate Plus siempre son dos Pros, con un Líder que hace la inspección final."),
    t("Work top to bottom, back to front: kitchen, bathrooms, every room, finish.", "Trabaja de arriba hacia abajo y de atrás hacia adelante: cocina, baños, cada habitación, toque final."),
  ]));
}

// ---------- document registry ----------
export type DocDef = { slug: string; category: string; title: [string, string]; build: (src: DocSources, l: Lang) => DocSection[] };

const perService = (svc: Svc) => ({ en: SVC_NAME[svc][0], es: SVC_NAME[svc][1] });

function jobDescription(svc: Svc): DocDef {
  return {
    slug: `job-${svc}`, category: "Job descriptions", title: [`Job description — ${perService(svc).en}`, `Descripción del puesto — ${perService(svc).es}`],
    build: (src, l) => {
      const t = T(l);
      return [
        sec(t("The role", "El puesto"), p(t(`Independent ${perService(svc).en.toLowerCase()} Pro serving Tidy members in Pinecrest 33156, Kendall 33183 and Kendall West 33186. The same Pro for each service, every visit.`, `Pro independiente de ${perService(svc).es.toLowerCase()} para miembros de Tidy en Pinecrest 33156, Kendall 33183 y Kendall West 33186. El mismo Pro para cada servicio, en cada visita.`))),
        sec(t("Pay", "Pago"), payTableFor(svc, l), payExtras(l, svc)),
        ...scopeSections(src, svc, l),
        kitSection(l, svc),
        sec(t("What you bring", "Lo que traes"), list([t("Your own equipment, supplies, vehicle and phone.", "Tu propio equipo, productos, vehículo y teléfono."), t("General liability insurance and a cleared background check.", "Seguro de responsabilidad civil y verificación de antecedentes aprobada.")])),
        contactSection(l),
      ];
    },
  };
}

function paySheet(svc: Svc): DocDef {
  return {
    slug: `pay-${svc}`, category: "Pay sheets", title: [`Pay sheet — ${perService(svc).en}`, `Hoja de pago — ${perService(svc).es}`],
    build: (_src, l) => {
      const t = T(l);
      const out = [sec(t("Pay per completed visit", "Pago por visita completada"), payTableFor(svc, l)), sec(t("Everything else you earn", "Todo lo demás que ganas"), payExtras(l, svc))];
      if (svc === "cleaning") out.push(sec(t("Estate homes", "Casas Estate"), list([
        t(`Estate: ${$(CLEANING_BASE_PAY[4])} per visit, one Pro, morning + midday windows. Member price ${$(CLEANING_MONTHLY[4].monthly)}/mo.`, `Estate: ${$(CLEANING_BASE_PAY[4])} por visita, un Pro, ventanas de mañana y mediodía. Precio al miembro ${$(CLEANING_MONTHLY[4].monthly)}/mes.`),
        t(`Estate Plus: ${$(CLEANING_BASE_PAY[5])} per team visit, always 2 Pros (${$(CLEANING_BASE_PAY[5] / 2)} each, or ${$(CLEANING_BASE_PAY[5])} to an owner with an approved helper). Member price ${$(CLEANING_MONTHLY[5].monthly)}/mo.`, `Estate Plus: ${$(CLEANING_BASE_PAY[5])} por visita de equipo, siempre 2 Pros (${$(CLEANING_BASE_PAY[5] / 2)} c/u, o ${$(CLEANING_BASE_PAY[5])} a un dueño con ayudante aprobado). Precio al miembro ${$(CLEANING_MONTHLY[5].monthly)}/mes.`),
        t(`First visit to an Estate or Estate Plus home pays ${ESTATE_FIRST_VISIT_MULTIPLIER}× (${$(CLEANING_BASE_PAY[4] * 1.5)} / ${$(CLEANING_BASE_PAY[5] * 1.5)}). The member pays no reset fee.`, `La primera visita a una casa Estate o Estate Plus paga ${ESTATE_FIRST_VISIT_MULTIPLIER}× (${$(CLEANING_BASE_PAY[4] * 1.5)} / ${$(CLEANING_BASE_PAY[5] * 1.5)}). El miembro no paga cargo de puesta a punto.`),
      ])), sec(t("Deep Clean pay", "Pago de Limpieza profunda"), addonTable("cleaning", l)));
      return out;
    },
  };
}

function handbook(svc: Svc): DocDef {
  return {
    slug: `handbook-${svc}`, category: "Handbooks", title: [`Pro handbook — ${perService(svc).en}`, `Manual del Pro — ${perService(svc).es}`],
    build: (src, l) => {
      const t = T(l);
      return [
        windowsSection(l, svc), ...scopeSections(src, svc, l),
        ...(svc === "cleaning" ? [deepCleanSection(src, l)] : []),
        sec(t("Add-ons and pay", "Adicionales y pago"), addonTable(svc, l)),
        redoSection(l), lockoutSection(l), accessSection(l, svc), profileSection(l), kitSection(l, svc), insuranceSection(l),
        sec(t("Friday pay, Tier 2, review bonus", "Pago del viernes, Nivel 2, bono por reseña"), payTableFor(svc, l), payExtras(l, svc)),
        contactSection(l),
      ];
    },
  };
}

function addonPricing(svc: Svc): DocDef {
  return {
    slug: `addons-${svc}`, category: "Add-on pricing", title: [`Add-on pricing — ${perService(svc).en}`, `Precios de adicionales — ${perService(svc).es}`],
    build: (_src, l) => {
      const t = T(l);
      return [sec(t("Member price and Pro pay", "Precio al miembro y pago al Pro"), addonTable(svc, l)),
        sec(t("Bundling", "Paquetes"), list([
          t(`Bundling is a gift, never a discount: 2 services = 1 free premium add-on a month (${$(GIFT_MAX)} or under), 3 services = 2.`, `Los paquetes son un regalo, nunca un descuento: 2 servicios = 1 adicional premium gratis al mes (${$(GIFT_MAX)} o menos), 3 servicios = 2.`),
          t("Gifted add-ons still pay the Pro 40%.", "Los adicionales regalados igual pagan 40% al Pro."),
          t(`Referral: give ${$(REFERRAL_BONUS_CENTS / 100)} / get ${$(REFERRAL_BONUS_CENTS / 100)}.`, `Referidos: da ${$(REFERRAL_BONUS_CENTS / 100)} / recibe ${$(REFERRAL_BONUS_CENTS / 100)}.`),
          ...(svc === "car" ? [t(`Car Wash Add-On: ${([1, 2, 3] as const).map((s) => `${$(CAR_WASH_PRICES[s][1])}/${$(CAR_WASH_PRICES[s][2])}`).join(" · ")} a month for 1/2 washes.`, `Lavado de auto adicional: ${([1, 2, 3] as const).map((s) => `${$(CAR_WASH_PRICES[s][1])}/${$(CAR_WASH_PRICES[s][2])}`).join(" · ")} al mes por 1/2 lavados.`)] : []),
        ]))];
    },
  };
}

function onboardingPacket(svc: Svc): DocDef {
  return {
    slug: `packet-${svc}`, category: "Onboarding packets", title: [`Onboarding packet — ${perService(svc).en}`, `Paquete de incorporación — ${perService(svc).es}`],
    build: (src, l) => {
      const t = T(l);
      return [
        sec(t("The 5-document onboarding pack", "El paquete de 5 documentos"), list([
          t("1. Pro Intake — identity, emergency contact, vest size, vehicle, availability.", "1. Ficha del Pro — identidad, contacto de emergencia, talla de chaleco, vehículo, disponibilidad."),
          t("2. Insurance guide — $1M / $2M general liability, how to get a quote.", "2. Guía de seguro — responsabilidad civil $1M / $2M, cómo cotizar."),
          t("3. Background check — Checkr invite, paid by Tidy.", "3. Verificación de antecedentes — invitación de Checkr, pagada por Tidy."),
          t(`4. ${perService(svc).en} agreement — signed digitally in the app. No paper W-9: tax info goes through Stripe.`, `4. Acuerdo de ${perService(svc).es} — se firma digitalmente en la app. Sin W-9 en papel: los datos fiscales van por Stripe.`),
          t("5. Pro app link — orientation, Stripe payout setup and first assignment.", "5. Enlace a la app del Pro — orientación, configuración de pagos en Stripe y primera asignación."),
        ])),
        sec(t("Orientation sections", "Secciones de la orientación"), table([t("Section", "Sección"), t("Unlocks when", "Se abre cuando")], ORIENTATION_SECTIONS.map((s) => [l === "en" ? s.title : s.es, l === "en" ? s.unlock : s.unlockEs]))),
        sec(t("Pay", "Pago"), payTableFor(svc, l), payExtras(l, svc)),
        kitSection(l, svc), insuranceSection(l),
        sec(t("Members stay with Tidy", "Los miembros se quedan con Tidy"), p(t("Members can't be solicited for 12 months after the agreement ends.", "No se puede ofrecer servicio directo a los miembros durante 12 meses después de terminar el acuerdo."))),
        ...scopeSections(src, svc, l).slice(0, 1),
        contactSection(l),
      ];
    },
  };
}

function scheduleA(src: DocSources, l: Lang): DocSection[] {
  const t = T(l);
  const current = src.contracts.filter((c) => c.is_current && (c.lang === l || c.lang === "en"));
  if (!current.length) return [sec("Schedule A", p(t("No current agreement template found.", "No se encontró una plantilla vigente.")))];
  return current.filter((c, i, a) => a.findIndex((x) => x.service === c.service) === i).map((c) => {
    const i = c.body.search(/SCHEDULE A/i);
    const j = c.body.search(/SCHEDULE B/i);
    const text = i >= 0 ? c.body.slice(i, j > i ? j : undefined) : c.body.slice(0, 1200);
    return sec(`${c.service} · ${t("version", "versión")} ${c.version}${c.lang !== l ? t("", " (solo en inglés)") : ""}`,
      ...text.split(/\s{2,}|(?<=\.)\s(?=[A-Z][a-z]+ ·|[A-Z][a-z]+ —)/).filter(Boolean).map((x) => p(x.trim())),
      ...(c.service.includes("clean") ? [deepCleanSection(src, l).blocks[0], addonTable("cleaning", l)] : []));
  });
}

export const LIVING_DOCS: DocDef[] = [
  ...(["cleaning", "lawn", "car"] as Svc[]).map(jobDescription),
  ...(["cleaning", "lawn", "car"] as Svc[]).map(paySheet),
  ...(["cleaning", "lawn", "car"] as Svc[]).map(handbook),
  ...(["cleaning", "lawn", "car"] as Svc[]).map(addonPricing),
  ...(["cleaning", "lawn", "car"] as Svc[]).map(onboardingPacket),
  {
    slug: "kit-brand", category: "Brand", title: ["Kit checklist and brand standards", "Lista del kit y estándares de marca"],
    build: (_s, l) => { const t = T(l); return [kitSection(l), sec(t("Kit items per service", "Artículos por servicio"), table([t("Service", "Servicio"), t("Item", "Artículo"), t("Qty", "Cant.")], (Object.keys(KIT_BY_SERVICE) as KitServiceKey[]).flatMap((k) => KIT_BY_SERVICE[k].map((i) => [k, l === "en" ? i.en : i.es, i.qty])))),
      sec(t("Brand", "Marca"), list([t("Navy, blue and gold. The circular Tidy logo is never altered.", "Azul marino, azul y dorado. El logo circular de Tidy nunca se altera."), t("Say \"the same Pro for each service, every visit\". Never \"easy\" or \"convenient\". Never \"eco-safe\" or claims we can't prove.", "Decimos \"el mismo Pro para cada servicio, en cada visita\". Nunca \"fácil\" ni \"conveniente\". Nunca afirmaciones que no podamos probar."), t("Never show the business street address to customers.", "Nunca mostrar la dirección del negocio a los clientes.")]))]; },
  },
  {
    slug: "route-sop", category: "Operations", title: ["Route ownership SOP", "Procedimiento de propiedad de ruta"],
    build: (_s, l) => { const t = T(l); return [sec(t("Arrival windows", "Ventanas de llegada"), list([t("Cleaning: 8–10 AM, 11 AM–1 PM or 2–4 PM.", "Limpieza: 8–10 AM, 11 AM–1 PM o 2–4 PM."), t("Estate homes take a double window: morning + midday.", "Las casas Estate usan doble ventana: mañana + mediodía.")])),
      sec(t("Routes", "Rutas"), list([t("Each Pro owns a route per service, ZIP and weekday.", "Cada Pro es dueño de una ruta por servicio, código postal y día."), t("Lawn routes are set by street.", "Las rutas de césped se arman por calle."), t("Friday is the catch-up day for rain-outs, with at least 24 hours' notice.", "El viernes es el día de recuperación por lluvia, con al menos 24 horas de aviso."), t("Capacity rule: when a route reaches 85% of its hours, the next Pro is recruited for it.", "Regla de capacidad: cuando una ruta llega al 85% de sus horas, se recluta al siguiente Pro.")]))]; },
  },
  {
    slug: "palm-frond", category: "Operations", title: ["Palm frond stipulation", "Estipulación de hojas de palma"],
    build: (_s, l) => { const t = T(l); const leaf = ADDON_CATALOG.find((a) => a.key === "leaf_debris_cleanup"); return [sec(t("Policy", "Política"), list([
      t("Fallen palm fronds on the lawn are moved aside so the yard can be cut; that is part of the visit.", "Las hojas de palma caídas en el césped se apartan para poder cortar; eso es parte de la visita."),
      t(`A full frond and debris clear-up is the Leaf & Debris Cleanup add-on: ${leaf ? $(leaf.price) : "—"} member price, ${leaf ? $(leaf.price * 0.4) : "—"} Pro pay.`, `Limpiar todas las hojas y escombros es el adicional de Hojas y escombros: ${leaf ? $(leaf.price) : "—"} al miembro, ${leaf ? $(leaf.price * 0.4) : "—"} al Pro.`),
      t("No cutting fronds from trees, no tree work and no hauling away.", "No se cortan hojas de los árboles, no hay trabajo en árboles ni acarreo."),
    ]))]; },
  },
  { slug: "schedule-a", category: "Contracts", title: ["Contract Schedule A", "Contrato — Anexo A"], build: scheduleA },
  {
    slug: "hiring-playbook", category: "HR", title: ["Interview guide and hiring playbook", "Guía de entrevista y proceso de contratación"],
    build: (_s, l) => { const t = T(l); return [sec(t("The 8-stage hiring order", "Las 8 etapas de contratación"), list(["applied", "screened", "proof", "agreement", "ins_quote", "background", "insured", "active"].map((s, i) => `${i + 1}. ${({ applied: t("Applied", "Aplicó"), screened: t("Phone screen", "Llamada"), proof: t("Equipment proof", "Prueba de equipo"), agreement: t("Agreement signed digitally", "Acuerdo firmado digitalmente"), ins_quote: t("Insurance quote", "Cotización de seguro"), background: t("Background check", "Verificación de antecedentes"), insured: t("Insurance on file", "Seguro registrado"), active: t("Active", "Activo") } as Record<string, string>)[s]}`))),
      sec(t("In-person conversation", "Conversación en persona"), list([t("Gauge interest, check equipment, sign if suitable, and show the Pro app.", "Ver interés, revisar equipo, firmar si encaja y mostrar la app del Pro."), t("No paper W-9: tax info goes through Stripe.", "Sin W-9 en papel: los datos fiscales van por Stripe."), t("Kit: vests and photo ID badge only, optional.", "Kit: solo chalecos y credencial con foto, opcional.")]))]; },
  },
  {
    slug: "pro-intake", category: "Onboarding", title: ["Pro intake and kit order", "Ficha del Pro y pedido del kit"],
    build: (_s, l) => { const t = T(l); return [sec(t("Fill in", "Completar"), table([t("Field", "Campo"), t("Answer", "Respuesta")], [[t("Legal name", "Nombre legal"), "______________________"], [t("Badge name", "Nombre en credencial"), "______________________"], [t("Service", "Servicio"), t("Cleaning / Lawn / Car care", "Limpieza / Césped / Auto")], [t("Vest size", "Talla de chaleco"), VEST_SIZES.join(" · ")], [t("Vehicle magnets (optional)", "Imanes del vehículo (opcional)"), t("Yes / No", "Sí / No")], [t("Ship to", "Enviar a"), "______________________"]])), kitSection(l)]; },
  },
  {
    slug: "customer-service-sop", category: "Operations", title: ["Customer service SOP", "Procedimiento de atención al cliente"],
    build: (src, l) => { const t = T(l); return [
      ...(["cleaning", "lawn", "car"] as Svc[]).flatMap((s) => scopeSections(src, s, l).map((x) => ({ ...x, heading: `${SVC_NAME[s][l === "en" ? 0 : 1]} · ${x.heading}` }))),
      sec(t("\"I want a deep clean\"", "\"Quiero una limpieza profunda\""), list([
        t("Offer the Deep Clean add-on at their home's size price:", "Ofrece la Limpieza profunda al precio de su tamaño de casa:"),
        ...CLEANING_BANDS.map((b) => `${b.name}: ${$(DEEP_CLEAN_PRICE[b.size as CleaningSize])}`),
        t("Weekly cleaning plans already get a quarterly deep clean every 13th week.", "Los planes semanales ya incluyen una limpieza profunda trimestral cada 13.ª semana."),
        t("Never a one-time clean without a plan, move-in/move-out or post-construction.", "Nunca limpieza única sin plan, mudanzas ni post-construcción."),
      ])),
      redoSection(l), lockoutSection(l),
      sec(t("Skips and pauses", "Omitir y pausar"), list([t("Follow the Member Guide: skips and pauses are made from the member's dashboard.", "Sigue la Guía para miembros: se omite o pausa desde el panel del miembro.")])),
      sec(t("Estate homes", "Casas Estate"), list([t("Estate 3,200–4,800 sq ft: one Pro, morning + midday windows.", "Estate 3,200–4,800 pies²: un Pro, ventanas de mañana y mediodía."), t("Estate Plus 4,800–7,000 sq ft: always two Pros.", "Estate Plus 4,800–7,000 pies²: siempre dos Pros."), t("Over 7,000 sq ft: a walkthrough first.", "Más de 7,000 pies²: primero una visita previa."), t("Baseboards, blinds, fans and walls are sold only inside Deep Clean in Estate homes.", "En casas Estate, zócalos, persianas, ventiladores y paredes solo se venden dentro de la Limpieza profunda.")])),
      sec(t("Outside scope", "Fuera del alcance"), p(t("Point the member to their \"Before you book\" acknowledgment in their account, then offer the matching add-on.", "Indica al miembro su confirmación de \"Antes de reservar\" en su cuenta y ofrece el adicional correspondiente."))),
      contactSection(l)]; },
  },
  {
    slug: "deep-clean-sop", category: "Operations", title: ["Deep Clean SOP (Pro)", "Procedimiento de Limpieza profunda (Pro)"],
    build: (src, l) => { const t = T(l); return [
      sec(t("Order of work", "Orden de trabajo"), list([t("Finish the standard visit list first, then the Deep Clean items top to bottom: fans and fixtures, blinds, walls and doors, baseboards, inside oven, inside fridge.", "Termina la lista estándar primero y luego los puntos de Limpieza profunda de arriba hacia abajo: ventiladores y lámparas, persianas, paredes y puertas, zócalos, dentro del horno, dentro del refrigerador.")])),
      sec(t("The 6 items", "Los 6 puntos"), list(deepCleanRows(src, l))),
      sec(t("Photos", "Fotos"), p(t("One after-photo per item. The job can't be finished without all 6.", "Una foto final por punto. El trabajo no se puede terminar sin las 6."))),
      sec(t("Price and Pro pay by size", "Precio y pago por tamaño"), addonTable("cleaning", l)),
      sec(t("More than Deep Clean covers", "Más de lo que cubre"), p(t("Photo it and tap \"Suggest an add-on\". Never promise extra work at the door.", "Tómale foto y toca \"Sugerir un adicional\". Nunca prometas trabajo extra en la puerta."))),
    ]; },
  },
];

export function buildDoc(def: DocDef, src: DocSources, l: Lang): LivingDoc {
  return { slug: def.slug, title: def.title[l === "en" ? 0 : 1], sections: def.build(src, l) };
}

export function docPlainText(doc: LivingDoc): string {
  return [doc.title, ...doc.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => b.kind === "p" ? [b.text] : b.kind === "list" ? b.items : [b.head.join(" "), ...b.rows.map((r) => r.join(" "))])])].join("\n");
}

/** Newest date among the sources a document reads. Code canon counts as CANON_DATE. */
export const CANON_DATE = "2026-10-30";
export function docUpdatedAt(src: DocSources): string {
  const dates = [CANON_DATE, ...src.scope.map((r) => r.updated_at ?? ""), ...src.contracts.map((c) => c.created_at)].filter(Boolean).sort();
  return dates[dates.length - 1];
}
