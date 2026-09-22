import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type GateService = "cleaning" | "lawn" | "car_care";

/**
 * Reads service_gates.is_live for the public site.
 *
 * A service that is not live shows "Opening soon — join the list" instead of
 * pricing and signup. Until the read resolves we assume live, so a slow network
 * never flashes "opening soon" at a customer on a service that is running.
 */
export function useServiceGates(): { live: Record<GateService, boolean>; loading: boolean } {
  const [live, setLive] = useState<Record<GateService, boolean>>({
    cleaning: true, lawn: true, car_care: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("service_gates").select("service, is_live");
      if (cancelled) return;
      if (!error && data) {
        const next = { cleaning: true, lawn: true, car_care: true } as Record<GateService, boolean>;
        for (const row of data) {
          if (row.service in next) next[row.service as GateService] = row.is_live === true;
        }
        setLive(next);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { live, loading };
}
