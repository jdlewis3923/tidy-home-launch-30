/** Badge photo rules — mirrors supabase/functions/_shared/pro-emails.ts. English then Spanish. */
export const PHOTO_DO: [string, string][] = [
  ["Wear your Tidy polo, or a plain solid shirt", "Use su polo de Tidy, o una camisa lisa de un solo color"],
  ["Stand in front of a plain light wall, about two feet back", "Párese frente a una pared clara y lisa, a unos dos pies de distancia"],
  ["Face the camera straight on, shoulders square", "Mire de frente a la cámara, con los hombros derechos"],
  ["Head and shoulders, centered", "Cabeza y hombros, centrados"],
  ["Natural light, facing a window", "Luz natural, mirando hacia una ventana"],
  ["Phone at eye level, or have someone take it", "El teléfono a la altura de los ojos, o que otra persona la tome"],
  ["A normal, friendly expression", "Una expresión normal y amable"],
];
export const PHOTO_DONT: [string, string][] = [
  ["No hats, sunglasses or headphones", "Sin gorras, gafas de sol ni audífonos"],
  ["No filters", "Sin filtros"],
  ["No other people in the photo", "Sin otras personas en la foto"],
  ["Not inside a car", "No dentro de un carro"],
  ["Not in harsh sun", "No bajo sol fuerte"],
  ["No busy background — no furniture, signs or doorways", "Sin fondo recargado — sin muebles, letreros ni puertas"],
  ["Not shot from below", "No tomada desde abajo"],
  ["Not a group photo you cropped yourself out of", "No una foto de grupo recortada"],
];
export const PHOTO_ORIGINAL: [string, string] = [
  "Send the original photo, not a screenshot, so it stays sharp in print.",
  "Envíe la foto original, no una captura de pantalla, para que se imprima nítida.",
];
export const PHOTO_PURPOSE: [string, string] = [
  "It appears on your Tidy badge with your first name, last initial and Pro number. It is never used in advertising, and the badge is deactivated if you leave.",
  "Aparece en su credencial de Tidy con su nombre, la inicial de su apellido y su número de Pro. Nunca se usa en publicidad, y la credencial se desactiva si usted se va.",
];
export const RETAKE_REASONS: { key: string; en: string; es: string }[] = [
  { key: "too_dark", en: "Too dark", es: "Muy oscura" },
  { key: "too_far", en: "Too far away", es: "Muy lejos" },
  { key: "background", en: "Background", es: "Fondo" },
  { key: "hat_sunglasses", en: "Hat or sunglasses", es: "Gorra o gafas" },
  { key: "blurry", en: "Blurry", es: "Borrosa" },
  { key: "not_facing", en: "Not facing the camera", es: "No mira a la cámara" },
];
