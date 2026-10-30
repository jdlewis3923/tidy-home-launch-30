import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CatalogAddon } from '@/lib/deep-clean';
export function useAddonCatalog() {
  return useQuery({ queryKey: ['addon_catalog', 'active'], staleTime: 60000, queryFn: async () => {
    const { data, error } = await supabase.from('addon_catalog')
      .select('addon_key,display_name,display_name_es,description_en,description_es,price_cents,services,gift_eligible,estate_bundle_only,size_prices,added_minutes,pro_pay_pct,lookup_key')
      .eq('is_active', true).order('sort_order');
    if (error) throw error;
    return (data ?? []) as CatalogAddon[];
  }});
}