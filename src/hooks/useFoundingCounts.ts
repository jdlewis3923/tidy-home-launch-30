import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FOUNDING_CAP, type ReservableService } from '@/lib/launch';

export type FoundingCounts = Record<ReservableService, number>;

/** Real reserved counts per service from the reservations table. Never seeded. */
export function useFoundingCounts() {
  return useQuery({
    queryKey: ['founding-spot-counts'],
    staleTime: 30_000,
    queryFn: async (): Promise<FoundingCounts> => {
      const { data, error } = await supabase.rpc('founding_spot_counts');
      if (error) throw error;
      const out: FoundingCounts = { cleaning: 0, lawn: 0, detailing: 0 };
      for (const row of data ?? []) out[row.service as ReservableService] = row.reserved;
      return out;
    },
  });
}

export const isFull = (counts: FoundingCounts | undefined, svc: ReservableService) =>
  !!counts && counts[svc] >= FOUNDING_CAP;
