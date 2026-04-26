import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Quiet returning-customer affordance, calm cream/ink styling.
 * Real <form> with autocomplete so password managers offer to save and
 * autofill credentials.
 */
export default function ExistingAccountInline() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
      } else {
        navigate('/dashboard');
      }
    } catch {
      setError('Login service is unavailable. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-hairline bg-white/60 px-4 py-3 backdrop-blur">
        <span className="text-xs text-ink-faint">already a member?</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-ink underline-offset-4 hover:underline"
        >
          sign in
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleLogin}
      className="space-y-3 rounded-xl border border-hairline bg-white/80 p-4 backdrop-blur animate-calm-in"
      autoComplete="on"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">welcome back.</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-ink-faint hover:text-ink"
        >
          cancel
        </button>
      </div>

      <input
        type="email"
        name="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        required
        className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
      />
      <input
        type="password"
        name="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        autoComplete="current-password"
        required
        className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <a href="/forgot-password" className="text-[11px] text-ink-faint hover:text-ink">
          forgot password?
        </a>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-ink/90 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {loading ? 'signing in…' : 'sign in'}
        </button>
      </div>
    </form>
  );
}
