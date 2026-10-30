import { ORIENTATION_COPY, type OrientationBlock, type OrientationSectionId } from './orientation';
import type { ScopeRow, ScopeService } from './serviceScope';

const sources: Record<string, ScopeService[]> = {
  'Cleaning scope': ['cleaning'], 'Lawn scope': ['lawn'], 'Car care scope': ['car_wash', 'car_detail'],
};
const labels = { included: ['Included', 'Incluido'], not_included: ['Not included', 'No incluido'], customer_must: ['Before the visit', 'Antes de la visita'], notice: ['Notice', 'Aviso'] } as const;

/** Active scope replaces only words; follow-on slides reuse the existing steps layout. */
export function orientationCopyWithScope(rows: ScopeRow[]): Record<OrientationSectionId, OrientationBlock[]> {
  const copy = { ...ORIENTATION_COPY };
  copy['on-the-job'] = ORIENTATION_COPY['on-the-job'].flatMap(block => {
    const services = sources[block.title];
    if (!services) return [block];
    const active = rows.filter(row => row.active && services.includes(row.service));
    const included = active.filter(row => row.section === 'included');
    // Each row is already a bilingual paragraph; never silently omit long scope text.
    const result: OrientationBlock[] = [{ ...block, body: included[0]?.text_en ?? '', es: included[0]?.text_es ?? '' }];
    for (const row of included.slice(1)) result.push({ title: `${block.title}: ${result.length + 1}`, esTitle: `${block.esTitle}: ${result.length + 1}`, body: row.text_en, es: row.text_es });
    for (const section of ['not_included', 'customer_must', 'notice'] as const) {
      const selected = active.filter(row => row.section === section);
      for (let i = 0; i < selected.length; i += 3) {
        const chunk = selected.slice(i, i + 3);
        result.push({ title: `${block.title}: ${labels[section][0]} ${i / 3 + 1}`, esTitle: `${block.esTitle}: ${labels[section][1]} ${i / 3 + 1}`, body: chunk.map(row => row.text_en).join('\n'), es: chunk.map(row => row.text_es).join('\n') });
      }
    }
    if (block.title === 'Cleaning scope') result.push({ title: 'Quarterly deep clean', esTitle: 'Limpieza profunda trimestral', body: 'Weekly plans, every 13th week: everything in the standard visit plus baseboards hand-wiped, door frames and doors wiped, blinds dusted, vents and returns dusted, and behind and under furniture you can safely reach.', es: 'En los planes semanales, cada 13 semanas: todo lo de la visita estándar, más zócalos limpiados a mano, marcos y puertas repasados, persianas, rejillas y retornos sin polvo, y detrás y debajo de los muebles que puedas alcanzar con seguridad.' });
    return result;
  });
  return copy;
}