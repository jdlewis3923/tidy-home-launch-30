/**
 * useHasRole — client-side check for an app role via the user_roles table.
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

const roleCache = new Map<AppRole, { userId: string | null; value: boolean }>();
const roleRequests = new Map<AppRole, Promise<{ userId: string | null; value: boolean }>>();

async function readRole(role: AppRole) {
  const pending = roleRequests.get(role);
  if (pending) return pending;
  const request = (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;
    const cached = roleCache.get(role);
    if (cached?.userId === userId) return cached;
    if (!userId) {
      const result = { userId: null, value: false };
      roleCache.set(role, result);
      return result;
    }
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", role)
      .maybeSingle();
    const result = { userId, value: !error && data?.role === role };
    roleCache.set(role, result);
    return result;
  })().finally(() => roleRequests.delete(role));
  roleRequests.set(role, request);
  return request;
}

export function useHasRoleState(role: AppRole): { hasRole: boolean; isLoading: boolean } {
  const [hasRole, setHasRole] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const result = await readRole(role);
      if (!cancelled) {
        setHasRole(result.value);
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    void check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      roleCache.delete(role);
      setIsLoading(true);
      void check();
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
