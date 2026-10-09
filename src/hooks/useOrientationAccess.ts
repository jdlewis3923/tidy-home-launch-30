import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { ORIENTATION_SECTIONS, stageNumber } from "@/lib/orientation";

export type OrientationState = { stage: string; progress: { section_id: string; started_at: string; completed_at: string | null }[] };
export function useOrientationAccess(adminPreview = false) {
  const { hasRole: isAdmin, isLoading: roleLoading } = useHasRoleState("admin");
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<OrientationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (roleLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(data.user?.id ?? null);
      if (!data.user || authError || (adminPreview && !isAdmin)) { setLoading(false); return; }
      if (adminPreview && isAdmin) { setState({ stage: "active", progress: [] }); setLoading(false); return; }
      const result = await supabase.rpc("pro_orientation_state" as never);
      if (cancelled) return;
      setState(result.error ? null : result.data as unknown as OrientationState);
      setError(Boolean(result.error));
      setLoading(false);
    })().catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [adminPreview, isAdmin, roleLoading]);
  const sections = state ? ORIENTATION_SECTIONS.filter(s => stageNumber(state.stage) >= s.min) : [];
  return { userId, state, sections, loading, error, isAdmin };
}