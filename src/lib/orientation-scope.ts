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
    const result: OrientationBlock[] = [];
    const sourceTitles: Partial<Record<ScopeService, [string, string]>> = {
      car_wash: ['Maintenance wash', 'Lavado de mantenimiento'],
      car_detail: ['Full detail — everything in the wash, plus', 'Detallado completo — todo lo del lavado, más'],
      cleaning_deep_clean: ['Quarterly deeper clean', 'Limpieza más profunda trimestral'],
    };
    const servicesToShow: ScopeService[] = block.title === 'Cleaning scope' ? [...services, 'cleaning_deep_clean'] : services;
    for (const service of servicesToShow) {
      const active = rows.filter(row => row.active && row.service === service).sort((a, b) => a.sort_order - b.sort_order);
      const title = sourceTitles[service] ?? [block.title, block.esTitle];
      const included = active.filter(row => row.section === 'included');
      for (const [index, row] of included.entries()) result.push({ ...block,
        title: `${title[0]}${index ? ': ' + (index + 1) : ''}`,
        esTitle: `${title[1]}${index ? ': ' + (index + 1) : ''}`, body: row.text_en, es: row.text_es,
      });
      for (const section of ['not_included', 'customer_must', 'notice', 'add_on'] as const) {
        const selected = active.filter(row => row.section === section);
        const label = section === 'add_on' ? ['Paid add-ons', 'Adicionales de pago'] : labels[section];
        for (let i = 0; i < selected.length; i += 3) {
          const chunk = selected.slice(i, i + 3);
          result.push({ title: `${title[0]}: ${label[0]} ${i / 3 + 1}`, esTitle: `${title[1]}: ${label[1]} ${i / 3 + 1}`, body: chunk.map(row => row.text_en).join('\n'), es: chunk.map(row => row.text_es).join('\n') });
        }
      }
    }
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