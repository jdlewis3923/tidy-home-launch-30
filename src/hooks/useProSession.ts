/**
 * useProSession — the Pro Portal's single source of session truth.
 *
 * Loads the signed-in Pro's own record, their COI state (which gates every
 * visit action) and their visits, all through Pro-scoped RPCs.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCoi, fetchMe, fetchVisits, type CoiState, type ProMe, type ProVisit } from "@/lib/pro-portal";
import type { SigningState } from "@/lib/signing-day";

export type ProSession = {
  userId: string | null;
  me: ProMe | null;
  coi: CoiState | null;
  /** Owner/admin viewing the portal: 1099 requirements (insurance) don't apply. */
  isOwner: boolean;
  gettingStarted: boolean;
  visits: ProVisit[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useProSession(): ProSession {
  const [userId, setUserId] = useState<string | null>(null);
  const [me, setMe] = useState<ProMe | null>(null);
  const [coi, setCoi] = useState<CoiState | null>(null);
  const [visits, setVisits] = useState<ProVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [gettingStarted,setGettingStarted] = useState(false);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? null;
        if (cancelled) return;
        setUserId(uid);
        if (!uid) {
          setLoading(false);
          return;
        }
        const [meRow, coiRow, roleRes, readyRes] = await Promise.all([
          fetchMe(),
          fetchCoi(uid),
          supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
          supabase.rpc("signing_day_state", {}),
        ]);
        if (readyRes.error) throw readyRes.error;
        const ready=readyRes.data as unknown as SigningState | null;
        const inactive=roleRes.data!==true && !!ready?.mode && !ready.active;
        const visitRows=inactive?[]:await fetchVisits();
        if (cancelled) return;
        setMe(meRow);
        setCoi(coiRow);
        setVisits(visitRows);
        setIsOwner(roleRes?.data === true);
        setGettingStarted(inactive);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { userId, me, coi, isOwner, gettingStarted, visits, loading, error, reload };
}
