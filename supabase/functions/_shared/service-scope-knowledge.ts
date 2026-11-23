import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

/** Live source wins over historical marketing and knowledge paragraphs. */
export async function loadServiceScopeKnowledge(client: SupabaseClient) {
  const { data, error } = await client.from('service_scope')
    .select('service,section,text_en,text_es,addon_key,sort_order,scope_version')
    .eq('active', true).order('service').order('sort_order');
  if (error || !data?.length) return 'Live service scope unavailable. Do not describe inclusions or exclusions; refer the customer to Tidy.';
  return `LIVE SERVICE SCOPE — authoritative English and Spanish; overrides every older service description. Only included rows are baseline work. add_on rows are paid extras, not included work. car_detail adds to car_wash; cleaning_deep_clean is the weekly quarterly visit, not the paid Deep Clean add-on (addon_key deep_clean). Never include engine bay or sell a $95 clay/ceramic item as a gift.\n${JSON.stringify(data)}`;
}
