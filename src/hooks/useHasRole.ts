/**
 * useHasRole — client-side check for an app role via Supabase RPC `has_role`.
 *
 * IMPORTANT: This is for UI gating only (showing/hiding nav links, badges).
 * Real authorization MUST live server-side in RLS policies and edge functions
 * — never trust this hook for security decisions.
 *
 * Returns { hasRole, isLoading } so callers can avoid flash-of-wrong-UI
 * (especially on mobile where role lookup may resolve after first paint).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export function useHasRoleState(role: AppRole): { hasRole: boolean; isLoading: boolean } {
  const [hasRole, setHasRole] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async (userId: string | undefined) => {
      if (!userId) {
        if (!cancelled) {
          setHasRole(false);
          setIsLoading(false);
        }
        return;
      }
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: role,
      });
      if (!cancelled) {
        setHasRole(!error && data === true);
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    supabase.auth.getUser().then(({ data }) => check(data.user?.id));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoading(true);
      check(session?.user?.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [role]);

  return { hasRole, isLoading };
}

/** Back-compat boolean form. Returns false until loaded. */
export function useHasRole(role: AppRole): boolean {
  return useHasRoleState(role).hasRole;
}
