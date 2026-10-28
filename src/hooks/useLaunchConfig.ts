import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LaunchConfig, LaunchRow } from "@/lib/launch";

/** Launch dates from launch_config. Undefined while loading — never a guessed date. */
export function useLaunchConfig(): LaunchConfig | undefined {
  const { data } = useQuery({
    queryKey: ["launch_config"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("launch_config").select("scope, first_visit_date, conversion_date, pro_callback_date, pro_ready_by, late_first_visit_week, hanger_drops, updated_at, car_launch_threshold, car_proposed_first_visit, car_proposed_conversion, car_proposed_at, car_proposed_for, car_threshold_reached_at");
      if (error) throw error;
      const cfg: LaunchConfig = {};
      for (const r of (data ?? []) as unknown as LaunchRow[]) cfg[r.scope] = r;
      return cfg;
    },
  });
  return data;
}
