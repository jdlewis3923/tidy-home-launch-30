import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LaunchConfig, LaunchRow } from "@/lib/launch";

/** Launch dates from launch_config. Undefined while loading — never a guessed date. */
export function useLaunchConfig(): LaunchConfig | undefined {
  const { data } = useQuery({
    queryKey: ["launch_config"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("launch_config").select("*");
      if (error) throw error;
      const cfg: LaunchConfig = {};
      for (const r of (data ?? []) as unknown as LaunchRow[]) cfg[r.scope] = r;
      return cfg;
    },
  });
  return data;
}
