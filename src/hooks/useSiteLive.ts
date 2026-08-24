/**
 * useSiteLive — fetches the global site_live flag from the database.
 *
 * Used by the App router to render the ComingSoon page for the entire public
 * site when an admin has flipped the switch off. Admin routes and /login
 * remain accessible regardless so admins can flip it back on.
 *
 * FAILS CLOSED: `isLive` starts as false and only becomes true when the RPC
 * explicitly returns true. Any network/RPC failure keeps the site gated and
 * is logged, so a broken read can never publish an unfinished site.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSiteLive(): { isLive: boolean; isLoading: boolean; refresh: () => void } {
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("is_site_live");
        if (cancelled) return;
        if (error) {
          console.error("[useSiteLive] is_site_live failed — staying gated:", error.message);
          setIsLive(false);
        } else if (typeof data === "boolean") {
          setIsLive(data);
        } else {
          console.error("[useSiteLive] unexpected is_site_live payload — staying gated:", data);
          setIsLive(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[useSiteLive] is_site_live threw — staying gated:", err);
        setIsLive(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { isLive, isLoading, refresh: () => setTick((t) => t + 1) };
}

