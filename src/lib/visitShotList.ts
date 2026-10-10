/** Before/after shot list per service, English then Spanish. Same angle before and after. */
export type Shot = [string, string];

export const SHOT_RULES: Shot[] = [
  ["Take the after photo from the same spot and angle as the before.", "Tome la foto de después desde el mismo lugar y ángulo que la de antes."],
  ["Hold the phone sideways, lights on, no filters.", "Sostenga el teléfono de lado, con las luces encendidas, sin filtros."],
  ["Never photograph people, pets, mail, screens or anything with a name or address.", "Nunca fotografíe personas, mascotas, correo, pantallas ni nada con nombre o dirección."],
];

export const SHOT_LIST: Record<string, { label: string; shots: Shot[] }> = {
  cleaning: {
    label: "Home cleaning / Limpieza del hogar",
    shots: [
      ["Kitchen counters and sink, wide", "Mostradores y fregadero de la cocina, toma amplia"],
      ["Stovetop", "Estufa"],
      ["Main bathroom: sink, toilet and shower", "Baño principal: lavamanos, inodoro y ducha"],
      ["Living room floor, from the doorway", "Piso de la sala, desde la puerta"],
      ["Each bedroom, from the doorway", "Cada habitación, desde la puerta"],
    ],
  },
  lawn: {
    label: "Lawn care / Cuidado del césped",
    shots: [
      ["Front lawn, wide, from the street", "Césped del frente, toma amplia, desde la calle"],
      ["Back lawn, wide", "Césped de atrás, toma amplia"],
      ["Edges along the driveway and sidewalk", "Bordes junto a la entrada y la acera"],
      ["Clean driveway and walkways when finished", "Entrada y caminos limpios al terminar"],
    ],
  },
  car: {
    label: "Car care / Cuidado del auto",
    shots: [
      ["Driver side, full car", "Lado del conductor, auto completo"],
      ["Passenger side, full car", "Lado del pasajero, auto completo"],
      ["Front seats and dashboard", "Asientos delanteros y tablero"],
      ["Back seats and floor mats", "Asientos traseros y alfombras"],
      ["Wheels and tires, one close-up", "Ruedas y llantas, un primer plano"],
    ],
  },
};

export function shotListFor(service?: string | null) {
  const s = (service ?? "").toLowerCase();
  if (s.includes("lawn")) return SHOT_LIST.lawn;
  if (s.includes("car") || s.includes("shine") || s.includes("wash")) return SHOT_LIST.car;
  if (s.includes("clean")) return SHOT_LIST.cleaning;
  return null;
}
