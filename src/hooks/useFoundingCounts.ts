import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FOUNDING_CAP } from '@/lib/launch';

import { FOUNDING_ZIPS } from '@/lib/launch';
export { FOUNDING_ZIPS };
export type FoundingCounts = { byZip: Record<string, number>; total: number };

/** Real founding homes per ZIP (one per household) from the reservations table. Never seeded. */
export function useFoundingCounts() {
  return useQuery({
    queryKey: ['founding-spot-counts'],
    staleTime: 30_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<FoundingCounts> => {
      const { data, error } = await supabase.rpc('founding_home_counts');
      if (error) throw error;
      const byZip: Record<string, number> = { '33156': 0, '33183': 0, '33186': 0 };
      for (const row of data ?? []) byZip[row.zip] = row.homes;
      return { byZip, total: Object.values(byZip).reduce((a, b) => a + b, 0) };
    },
  });
}

export const isZipFull = (counts: FoundingCounts | undefined, zip: string | undefined) =>
  !!counts && !!zip && zip in counts.byZip && counts.byZip[zip] >= FOUNDING_CAP;
