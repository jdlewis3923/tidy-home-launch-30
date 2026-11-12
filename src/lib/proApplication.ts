// Website Pro application spec. Mirrored byte-for-byte to supabase/functions/_shared/pro-application.ts (parity-tested).
export type Service = 'cleaning' | 'lawn' | 'car';
export type Section = 'basics' | 'equipment' | 'work' | 'availability' | 'consent' | 'kit' | 'uploads';
export type FieldType = 'text' | 'email' | 'tel' | 'date' | 'number' | 'yesno' | 'multi' | 'select' | 'file';
export type Field = { key: string; section: Section; type: FieldType; en: string; es: string; required: boolean; options?: { v: string; en: string; es: string }[]; hint?: { en: string; es: string }; when?: (a: Record<string, unknown>) => boolean };

export const SERVICE_LABEL: Record<Service, { en: string; es: string; position: string }> = {
  cleaning: { en: 'House Cleaning Pro', es: 'Pro de Limpieza de Casas', position: 'House Cleaning Pro' },
  lawn: { en: 'Lawn Care Pro', es: 'Pro de Cuidado del Césped', position: 'Lawn Care Pro' },
  car: { en: 'Car Care Pro', es: 'Pro de Cuidado de Autos', position: 'Car Care Pro' },
};

export const EQUIPMENT: Record<Service, { key: string; en: string; es: string }[]> = {
  cleaning: [{ key: 'vacuum', en: 'Vacuum', es: 'Aspiradora' }, { key: 'mop_bucket', en: 'Mop and bucket', es: 'Trapeador y cubeta' }, { key: 'supplies', en: 'Cleaning supplies', es: 'Productos de limpieza' }],
  lawn: [{ key: 'mower', en: 'Mower', es: 'Cortadora de césped' }, { key: 'trimmer', en: 'Trimmer', es: 'Recortadora' }, { key: 'edger', en: 'Edger', es: 'Bordeadora' }, { key: 'blower', en: 'Blower', es: 'Sopladora' }],
  car: [{ key: 'pressure_washer', en: 'Pressure washer or wash kit', es: 'Hidrolavadora o kit de lavado' }, { key: 'shop_vac', en: 'Shop vac', es: 'Aspiradora de taller' }, { key: 'extractor', en: 'Extractor', es: 'Extractora' }, { key: 'polisher', en: 'Polisher', es: 'Pulidora' }],
};

const filled = (v: unknown) => Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== '';
const yes = (a: Record<string, unknown>, k: string) => a[k] === 'yes';
const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_ES: Record<string, string> = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb' };

export function fieldsFor(service: Service): Field[] {
  const f = (key: string, section: Section, type: FieldType, en: string, es: string, required = true, extra: Partial<Field> = {}): Field => ({ key, section, type, en, es, required, ...extra });
  return [
    f('first_name', 'basics', 'text', 'First name', 'Nombre'), f('last_name', 'basics', 'text', 'Last name', 'Apellido'),
    f('phone', 'basics', 'tel', 'Mobile number', 'Número de celular'), f('email', 'basics', 'email', 'Email', 'Correo electrónico'),
    f('street', 'basics', 'text', 'Home street address', 'Dirección de casa'), f('city', 'basics', 'text', 'City', 'Ciudad'), f('zip', 'basics', 'text', 'ZIP', 'Código postal'),
    f('dob', 'basics', 'date', 'Date of birth', 'Fecha de nacimiento'),
    ...EQUIPMENT[service].flatMap((e) => [
      f(`eq_${e.key}`, 'equipment', 'yesno', `Do you own a ${e.en.toLowerCase()}?`, `¿Tienes ${e.es.toLowerCase()}?`),
      f(`photo_${e.key}`, 'equipment', 'file', `Photo: ${e.en}`, `Foto: ${e.es}`, true, { when: (a) => yes(a, `eq_${e.key}`) }),
    ]),
    f('vehicle', 'work', 'yesno', 'Do you have a reliable vehicle?', '¿Tienes un vehículo confiable?'),
    f('license', 'work', 'yesno', "Do you have a valid driver's license?", '¿Tienes licencia de conducir vigente?'),
    f('languages', 'work', 'multi', 'Languages you speak', 'Idiomas que hablas', true, { options: [{ v: 'en', en: 'English', es: 'Inglés' }, { v: 'es', en: 'Spanish', es: 'Español' }, { v: 'other', en: 'Other', es: 'Otro' }] }),
    f('years', 'work', 'number', 'Years of experience', 'Años de experiencia'),
    f('days', 'availability', 'multi', 'Days available', 'Días disponibles', true, { options: days.map((d) => ({ v: d, en: d[0].toUpperCase() + d.slice(1), es: DAY_ES[d] })) }),
    f('hours', 'availability', 'select', 'Hours available', 'Horario disponible', true, { options: [{ v: 'morning', en: 'Mornings (8–12)', es: 'Mañanas (8–12)' }, { v: 'afternoon', en: 'Afternoons (12–5)', es: 'Tardes (12–5)' }, { v: 'full', en: 'Full day (8–5)', es: 'Día completo (8–5)' }] }),
    f('zips', 'availability', 'multi', 'ZIPs you can work', 'Códigos postales donde puedes trabajar', true, { options: ['33156', '33183', '33186'].map((z) => ({ v: z, en: z, es: z })) }),
    f('background_ok', 'consent', 'yesno', 'OK with a background check? (Tidy pays)', '¿Aceptas una verificación de antecedentes? (Tidy paga)'),
    f('insurance_ok', 'consent', 'yesno', 'OK carrying $1M/$2M liability insurance? (~$25–60/mo; Tidy pays back $50/mo for 3 months)', '¿Aceptas tener seguro de responsabilidad de $1M/$2M? (~$25–60/mes; Tidy te reembolsa $50/mes por 3 meses)'),
    f('vest_size', 'kit', 'select', 'Vest size (worn over a shirt — size up)', 'Talla de chaleco (se usa sobre la camisa — pide una talla más)', true, { options: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((s) => ({ v: s, en: s, es: s })) }),
    f('badge_name', 'kit', 'text', 'Name for your badge (first name + last initial)', 'Nombre para tu gafete (nombre + inicial del apellido)', true, { hint: { en: 'Example: Maria G.', es: 'Ejemplo: Maria G.' } }),
    f('ship_same', 'kit', 'yesno', 'Ship my kit to my home address', 'Enviar mi kit a mi dirección de casa', true, { when: (a) => filled(a.street) }),
    f('ship_street', 'kit', 'text', 'Kit shipping street', 'Dirección de envío del kit', true, { when: (a) => a.ship_same === 'no' || !filled(a.street) }),
    f('ship_city', 'kit', 'text', 'Kit shipping city', 'Ciudad de envío', true, { when: (a) => a.ship_same === 'no' || !filled(a.street) }),
    f('ship_zip', 'kit', 'text', 'Kit shipping ZIP', 'Código postal de envío', true, { when: (a) => a.ship_same === 'no' || !filled(a.street) }),
    f('ec_name', 'kit', 'text', 'Emergency contact name', 'Nombre del contacto de emergencia'),
    f('ec_relationship', 'kit', 'text', 'Relationship', 'Parentesco'),
    f('ec_phone', 'kit', 'tel', 'Emergency contact phone', 'Teléfono del contacto de emergencia'),
    f('vehicle_year', 'kit', 'text', 'Vehicle year', 'Año del vehículo'), f('vehicle_make', 'kit', 'text', 'Vehicle make', 'Marca'),
    f('vehicle_model', 'kit', 'text', 'Vehicle model', 'Modelo'), f('vehicle_color', 'kit', 'text', 'Vehicle color', 'Color'),
    f('vehicle_plate', 'kit', 'text', 'License plate', 'Placa'),
    f('magnet_opt_in', 'kit', 'yesno', 'Want a Tidy vehicle magnet?', '¿Quieres un imán de Tidy para tu vehículo?'),
    f('photo_id', 'uploads', 'file', 'Photo ID (front of license or state ID)', 'Identificación con foto (frente de licencia o ID estatal)'),
    f('badge_photo', 'uploads', 'file', 'Badge photo (front-facing, face clearly visible)', 'Foto para el gafete (de frente, cara visible)'),
    f('resume', 'uploads', 'file', 'Resume (optional)', 'Currículum (opcional)', false),
  ];
}

export const SECTION_ORDER: Section[] = ['basics', 'equipment', 'work', 'availability', 'consent', 'kit', 'uploads'];
export const SECTION_LABEL: Record<Section, { en: string; es: string }> = {
  basics: { en: 'About you', es: 'Sobre ti' }, equipment: { en: 'Your equipment', es: 'Tu equipo' }, work: { en: 'Experience', es: 'Experiencia' },
  availability: { en: 'Availability', es: 'Disponibilidad' }, consent: { en: 'Background & insurance', es: 'Antecedentes y seguro' },
  kit: { en: 'Your Tidy kit', es: 'Tu kit de Tidy' }, uploads: { en: 'Photo ID & badge photo', es: 'Identificación y foto del gafete' },
};

/** Fields the person is actually asked: never anything already on file (prefill) or in a skipped section. */
export function askedFields(service: Service, answers: Record<string, unknown>, prefill: Record<string, unknown> = {}, skip: string[] = []): Field[] {
  const merged = { ...prefill, ...answers };
  return fieldsFor(service).filter((f) => !skip.includes(f.section) && !filled(prefill[f.key]) && (!f.when || f.when(merged)));
}

export function fieldError(f: Field, v: unknown): string | null {
  if (!filled(v)) return f.required ? 'required' : null;
  const s = String(v).trim();
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'email';
  if (f.type === 'tel' && s.replace(/\D/g, '').length < 10) return 'phone';
  if ((f.key === 'zip' || f.key === 'ship_zip') && !/^\d{5}$/.test(s)) return 'zip';
  if (f.key === 'badge_name' && !/^[\p{L}'-]+ [\p{L}]\.?$/u.test(s)) return 'badge';
  if (f.type === 'number' && !(Number(s) >= 0 && Number(s) <= 60)) return 'number';
  if (f.key === 'dob') { const age = (Date.now() - Date.parse(s)) / 31557600000; if (!(age >= 18 && age < 100)) return 'age'; }
  if (s.length > 300) return 'long';
  return null;
}

/** Keys still missing or invalid; files live in a separate map keyed like answers. */
export function missingKeys(service: Service, answers: Record<string, unknown>, files: Record<string, unknown>, prefill: Record<string, unknown> = {}, skip: string[] = []): string[] {
  return askedFields(service, answers, prefill, skip).filter((f) => fieldError(f, f.type === 'file' ? files[f.key] : answers[f.key]) !== null).map((f) => f.key);
}

/** Kit section + photo ID + badge photo complete (this replaces the Connecteam intake and photo documents). */
export function kitComplete(service: Service, answers: Record<string, unknown>, files: Record<string, unknown>): boolean {
  return fieldsFor(service).filter((f) => (f.section === 'kit' || f.key === 'photo_id' || f.key === 'badge_photo') && (!f.when || f.when(answers))).every((f) => fieldError(f, f.type === 'file' ? files[f.key] : answers[f.key]) === null);
}

export function serviceFrom(raw: string | null | undefined): Service | null {
  const s = (raw ?? '').toLowerCase();
  if (/clean|house|home|limpieza/.test(s)) return 'cleaning';
  if (/lawn|yard|grass|cesped|césped|jardin/.test(s)) return 'lawn';
  if (/car|vehicle|wash|detail|auto/.test(s)) return 'car';
  return null;
}
