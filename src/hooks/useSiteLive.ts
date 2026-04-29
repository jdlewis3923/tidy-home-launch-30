/**
 * useSiteLive — fetches the global site_live flag from the database.
 *
 * Used by the App router to render the ComingSoon page for the entire public
 * site when an admin has flipped the switch off. Admin routes and /login
 * remain accessible regardless so admins can flip it back on.
 *
 * Defaults to `true` until the network call resolves to avoid a flash of the
 * coming-soon page on every cold load.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSiteLive(): { isLive: boolean; isLoading: boolean; refresh: () => void } {
  const [isLive, setIsLive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("is_site_live");
      if (cancelled) return;
      if (!error && typeof data === "boolean") setIsLive(data);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { isLive, isLoading, refresh: () => setTick((t) => t + 1) };
}
