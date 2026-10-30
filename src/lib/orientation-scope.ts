import { ORIENTATION_COPY, type OrientationBlock, type OrientationSectionId } from './orientation';
import type { ScopeRow, ScopeService } from './serviceScope';
import { addonQuote, type CatalogAddon } from './deep-clean';

const sources: Record<string, ScopeService[]> = {
  'Cleaning scope': ['cleaning'], 'Lawn scope': ['lawn'], 'Car care scope': ['car_wash', 'car_detail'],
};
const labels = { included: ['Included', 'Incluido'], not_included: ['Not included', 'No incluido'], customer_must: ['Before the visit', 'Antes de la visita'], notice: ['Notice', 'Aviso'] } as const;

/** Active scope replaces only words; follow-on slides reuse the existing steps layout. */
export function orientationCopyWithScope(rows: ScopeRow[], catalog: CatalogAddon[] = []): Record<OrientationSectionId, OrientationBlock[]> {
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
    if (block.title === 'Cleaning scope') {
      const deepRows = rows.filter(row => row.active && row.addon_key === 'deep_clean');
      const deep = catalog.find(a => a.addon_key === 'deep_clean');
      if (deepRows.length) result.push({title:'Deep Clean add-on',esTitle:'Limpieza profunda adicional',body:deepRows.map(r=>r.text_en).join('\n'),es:deepRows.map(r=>r.text_es).join('\n')});
      if (deep) result.push({title:'Deep Clean pay and time',esTitle:'Pago y tiempo de la limpieza profunda',body:[1,2,3,4,5].map(size=>{const q=addonQuote(deep,size);return `${size<4?'Size '+size:size===4?'Estate':'Estate Plus'}: $${((q?.payCents??0)/100).toFixed(2)} · +${q?.minutes} min${size===5?' · per team, two Pros':''}`;}).join('\n'),es:[1,2,3,4,5].map(size=>{const q=addonQuote(deep,size);return `${size<4?'Tamaño '+size:size===4?'Estate':'Estate Plus'}: $${((q?.payCents??0)/100).toFixed(2)} · +${q?.minutes} min${size===5?' · por equipo, dos Pros':''}`;}).join('\n')});
      if(deepRows.length) result.push({title:'Deep Clean work rules',esTitle:'Reglas de la limpieza profunda',body:'One required after-photo for each of the six items. Estate and Estate Plus: baseboards, blinds, fans/fixtures and walls/doors are booked only inside Deep Clean. Oven and fridge remain standalone. No monthly or founding gifts. Weekly quarterly visit: offer oven/fridge instead. Redos follow the 48-hour and member-wide 60-day paid-redo rules.',es:'Una foto final obligatoria por cada uno de los seis trabajos. Estate y Estate Plus: zócalos, persianas, ventiladores/lámparas y paredes/puertas solo se reservan dentro de Limpieza profunda. Horno y refrigerador siguen disponibles por separado. No es regalo mensual ni de fundador. En la visita trimestral semanal, ofrece horno y refrigerador. Los regresos siguen las reglas de 48 horas y de un regreso pagado por miembro cada 60 días.'});
    }
    return result;
  });
  return copy;
}