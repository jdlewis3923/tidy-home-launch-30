import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Auth events take precedence over an older, asynchronous initial read. */
export function useMemberSession() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true;
      if (active) setSignedIn(Boolean(session));
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active && !receivedEvent) setSignedIn(Boolean(data.session));
    }).catch(() => { /* Unknown auth must not offer a redundant login. */ });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return signedIn;
}