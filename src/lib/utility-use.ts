/** Shared booking conditions and factual utility availability labels. */
export const UTILITY_USE = {
  en: {
    carAcceptance: "I've read what's included and not included, and I understand that by booking, my Pro will use my home's outdoor water spigot and electrical outlet.",
    waterQuestion: "Does your home have an outdoor water spigot near where the car parks?",
    outletQuestion: "Does your home have an outdoor electrical outlet near where the car parks?",
    waterHelp: "Your Pro will use it during each visit. Choose No only if your home doesn't have one.",
    help: "Your Pro will use it during each visit. Choose No only if your home doesn't have one.",
    noWater: "Got it — your Pro will bring water for homes without a spigot.",
    noOutlet: "Got it — this home has no outdoor electrical outlet.",
    heading: "Water and electricity",
    conditions: [
      "Water and electricity use is a condition of booking. For car care and the Car Wash Add-On, your Pro will use your home's outdoor water spigot and electrical outlet when present. For house cleaning, your Pro will use your home's water and electricity during each visit.",
      "Choose No only if your home genuinely has no outdoor spigot or outlet. For homes without a spigot, your Pro brings water.",
      "If your home has a spigot or outlet but you report No or block access, your Pro records it in the Visit Report and Tidy contacts you. The visit still counts as used.",
    ],
  },
  es: {
    carAcceptance: "Leí lo que incluye y no incluye, y entiendo que al reservar, mi Pro usará la llave de agua exterior y el tomacorriente exterior de mi casa.",
    waterQuestion: "¿Tu casa tiene una llave de agua exterior cerca de donde se estaciona el auto?",
    outletQuestion: "¿Tu casa tiene un tomacorriente exterior cerca de donde se estaciona el auto?",
    waterHelp: "Tu Pro la usará durante cada visita. Elige No solo si tu casa no tiene una.",
    help: "Tu Pro lo usará durante cada visita. Elige No solo si tu casa no tiene uno.",
    noWater: "Entendido — tu Pro traerá agua para las casas sin llave de agua exterior.",
    noOutlet: "Entendido — esta casa no tiene tomacorriente exterior.",
    heading: "Agua y electricidad",
    conditions: [
      "El uso del agua y la electricidad es una condición de la reserva. Para el cuidado del auto y el lavado de auto adicional, tu Pro usará la llave de agua exterior y el tomacorriente exterior de tu casa si los tiene. Para la limpieza del hogar, tu Pro usará el agua y la electricidad de tu casa durante cada visita.",
      "Elige No solo si tu casa realmente no tiene una llave de agua exterior o un tomacorriente exterior. Para las casas sin llave de agua exterior, tu Pro trae agua.",
      "Si tu casa tiene una llave de agua exterior o un tomacorriente exterior pero indicas No o bloqueas el acceso, tu Pro lo registra en el Reporte de Visita y Tidy te contacta. La visita sigue contando como usada.",
    ],
  },
} as const;

export function utilityAnswersComplete(water: unknown, outlet: unknown) {
  return typeof water === 'boolean' && typeof outlet === 'boolean';
}

export function outdoorSpigotLine(value: boolean | null | undefined, lang: string = 'en') {
  if (lang === 'es') return `Llave de agua exterior: ${value === true ? 'Sí — úsala' : value === false ? 'No — esta casa no tiene, trae agua' : 'Sin respuesta — confirma si tiene una'}`;
  return `Outdoor spigot: ${value === true ? 'Yes — use it' : value === false ? 'No — this home has none, bring water' : 'Not answered — confirm availability'}`;
}