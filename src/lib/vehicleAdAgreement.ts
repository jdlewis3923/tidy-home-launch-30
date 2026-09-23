/**
 * Tidy — Vehicle Advertising Agreement (voluntary).
 *
 * Signed by the Pro from the intake form before any magnets are ordered. Kept
 * deliberately short and free of anything that could read as control over an
 * independent contractor: no routes, no hours, no appearance requirement, no
 * minimum driving.
 */

export const VEHICLE_AD_AGREEMENT_VERSION = "2026-09";
export const VEHICLE_AD_AGREEMENT_FILENAME = "22_VehicleAdvertisingAgreement.md";
export const VEHICLE_AD_CREDIT_USD = 15;

export const VEHICLE_AD_AGREEMENT_TITLE = {
  en: "Vehicle Advertising Agreement",
  es: "Acuerdo de Publicidad en Vehículo",
};

export const VEHICLE_AD_AGREEMENT_CLAUSES: { en: string; es: string }[] = [
  {
    en: "This is voluntary. You choose whether to display Tidy magnets on your vehicle, and you can stop at any time.",
    es: "Esto es voluntario. Usted decide si coloca los imanes de Tidy en su vehículo y puede dejar de hacerlo cuando quiera.",
  },
  {
    en: "The magnets remain Tidy property. They come off when the engagement ends, or sooner if either of us asks.",
    es: "Los imanes siguen siendo propiedad de Tidy. Se retiran cuando termina la relación de trabajo, o antes si cualquiera de las partes lo pide.",
  },
  {
    en: `While the magnets are displayed, Tidy adds a $${VEHICLE_AD_CREDIT_USD} per month vehicle advertising credit to your Friday deposit.`,
    es: `Mientras los imanes estén colocados, Tidy agrega un crédito de publicidad de $${VEHICLE_AD_CREDIT_USD} por mes a su depósito del viernes.`,
  },
  {
    en: "You choose when and where you drive. Nothing about your routes, your hours or your appearance changes because of this agreement.",
    es: "Usted decide cuándo y dónde conduce. Nada sobre sus rutas, sus horas o su apariencia cambia por este acuerdo.",
  },
  {
    en: "There is no minimum amount the vehicle must be driven, and no mileage is tracked.",
    es: "No hay un mínimo de kilometraje ni se registra cuánto conduce.",
  },
  {
    en: "You keep your own auto insurance. This agreement does not make you a Tidy driver and does not put you on any Tidy policy.",
    es: "Usted mantiene su propio seguro de auto. Este acuerdo no lo convierte en conductor de Tidy ni lo incluye en ninguna póliza de Tidy.",
  },
  {
    en: "Before magnets are ordered, you test your driver's door with a household magnet. Aluminium and composite panels will not hold, and nothing is ever taped or adhered to your vehicle.",
    es: "Antes de pedir los imanes, usted prueba la puerta del conductor con un imán de casa. El aluminio y los paneles compuestos no lo sostienen, y nunca se pega ni se adhiere nada a su vehículo.",
  },
  {
    en: "You remain an independent contractor. Declining magnets changes nothing else about your work with Tidy.",
    es: "Usted sigue siendo contratista independiente. Rechazar los imanes no cambia nada más en su trabajo con Tidy.",
  },
];

/** Plain-text copy registered in the Documents Library. */
export function vehicleAdAgreementText(): string {
  const head = `${VEHICLE_AD_AGREEMENT_TITLE.en} / ${VEHICLE_AD_AGREEMENT_TITLE.es}
Tidy Home Concierge LLC · version ${VEHICLE_AD_AGREEMENT_VERSION}
`;
  const body = VEHICLE_AD_AGREEMENT_CLAUSES.map(
    (c, i) => `${i + 1}. ${c.en}\n   ${c.es}`,
  ).join("\n\n");
  return `${head}\n${body}\n\nSigned by the Pro from the Tidy intake form. Tidy provides; the Pro chooses.\n`;
}
