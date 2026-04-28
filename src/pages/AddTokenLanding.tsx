/**
 * /add/:token — passwordless deep-link from add-on attach SMS.
 * Calls consume-addon-token, redirects to magic link action_link, which
 * lands them at /dashboard#add-to-next-visit.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function AddTokenLanding() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!token) { setError('Invalid link.'); return; }
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke('consume-addon-token', {
          body: { token, redirect_to: `${window.location.origin}/dashboard#add-to-next-visit` },
        });
        if (invokeErr || !data?.ok || !data.action_link) {
          setError(data?.error === 'token_expired' ? 'This link has expired. Open the dashboard to add to your next visit.'
                : data?.error === 'token_already_used' ? 'This link has already been used.'
                : 'We couldn\'t open this link.');
          return;
        }
        // Redirect to Supabase magic link → returns user signed in to /dashboard
        window.location.replace(data.action_link);
      } catch (err) {
        console.error('[add-token] failed', err);
        setError('Something went wrong opening this link.');
      }
    };
    run();
  }, [token, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-cream px-6 text-ink">
      <div className="max-w-md text-center">
        {error ? (
          <>
            <h1 className="text-xl font-bold">{error}</h1>
            <button
              onClick={() => navigate('/login')}
              className="mt-4 rounded-xl bg-ink px-5 py-2 text-sm font-semibold text-white"
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
            <p className="mt-3 text-sm text-ink-soft">Opening your dashboard…</p>
          </>
        )}
      </div>
    </div>
  );
}
