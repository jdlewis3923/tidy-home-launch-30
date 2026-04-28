import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import tidyLogo from '@/assets/tidy-logo.png';

/**
 * Calm Apple-style login. Cream paper, oversized logo, single column.
 * Real <form> + autocomplete so password managers offer save/autofill.
 */
export default function CustomerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Only allow same-origin internal paths to prevent open-redirect abuse.
  // If a redirect was explicitly requested (e.g. came from a protected route), honor it.
  // Otherwise we'll route admins → /admin/kpis and customers → /dashboard after sign-in.
  const rawRedirect = searchParams.get('redirect');
  const safeRedirect =
    rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('please enter your email and password.');
      return;
    }
    if (password.length < 8) {
      setError('password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${safeRedirect ?? '/dashboard'}` },
        });
        if (signUpError) {
          setError(signUpError.message);
        } else {
          setError('');
          setIsSignUp(false);
          alert('check your email to confirm your account, then sign in.');
        }
      } else {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) {
          setError(authError.message);
        } else {
          // Decide destination: explicit redirect wins; otherwise admins → KPI Command Center, others → dashboard.
          let destination = safeRedirect;
          if (!destination) {
            const userId = authData.user?.id;
            if (userId) {
              const { data: roles } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', userId);
              const isAdmin = (roles ?? []).some((r) => r.role === 'admin');
              destination = isAdmin ? '/admin/kpis' : '/dashboard';
            } else {
              destination = '/dashboard';
            }
          }
          navigate(destination);
        }
      }
    } catch {
      setError('login service is unavailable. please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream text-ink flex items-center justify-center px-5 py-12">
      {/* Warm cream daylight */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(36_60%_94%)_0%,hsl(36_27%_96%)_55%,hsl(35_22%_92%)_100%)]" />
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full opacity-50"
          style={{
            background: 'radial-gradient(circle, hsl(38 80% 88% / 0.85) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      <div className="w-full max-w-md space-y-8 animate-calm-rise">
        <div className="text-center">
          <a href="/" aria-label="Tidy">
            <img
              src={tidyLogo}
              alt="Tidy"
              className="h-32 md:h-36 w-auto mx-auto drop-shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
            />
          </a>
          <h1 className="mt-6 text-3xl font-bold text-ink lowercase tracking-tight" style={{ letterSpacing: '-0.025em' }}>
            {isSignUp ? 'create your account.' : 'welcome back.'}
          </h1>
          <p className="mt-2 text-sm text-ink-faint lowercase">
            {isSignUp ? 'one account. one home. handled.' : 'sign in to manage your plan.'}
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">email</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              {isSignUp ? 'create password' : 'password'}
            </label>
            <input
              type="password"
              name="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isSignUp ? 'min. 8 characters' : 'enter your password'}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={8}
              className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
              required
            />
            {isSignUp && password.length > 0 && (
              <p className={`text-[11px] mt-1 ${password.length >= 8 ? 'text-ink' : 'text-ink-faint'}`}>
                {password.length >= 8 ? 'strong enough.' : `${8 - password.length} more characters.`}
              </p>
            )}
          </div>

          {error && <p className="text-xs text-destructive lowercase">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="group w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-4 text-sm font-semibold text-white lowercase shadow-[0_14px_40px_-12px_hsl(var(--ink)/0.5)] transition-all hover:shadow-[0_22px_48px_-12px_hsl(var(--ink)/0.6)] hover:-translate-y-0.5 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? (isSignUp ? 'creating…' : 'signing in…') : (isSignUp ? 'create account' : 'sign in')}
          </button>

          <div className="text-center space-y-2 pt-2">
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-xs text-ink-faint hover:text-ink lowercase underline-offset-4 hover:underline"
            >
              {isSignUp ? 'already a member? sign in' : "new here? create an account"}
            </button>
            {!isSignUp && (
              <div>
                <Link to="/forgot-password" className="text-xs text-ink-faint hover:text-ink lowercase underline-offset-4 hover:underline">
                  forgot password?
                </Link>
              </div>
            )}
          </div>

          <div className="text-center pt-6 border-t border-hairline">
            <Link to="/" className="text-xs text-ink-faint hover:text-ink lowercase">
              ← back to tidy
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
