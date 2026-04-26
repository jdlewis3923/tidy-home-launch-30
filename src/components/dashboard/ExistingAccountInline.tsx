import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Inline "Already have a Tidy account?" affordance shown at the top of the
 * builder. Lets returning customers sign in without leaving the flow.
 *
 * Uses real <form>, autocomplete="email" + autocomplete="current-password",
 * so browsers (Chrome, Safari, 1Password, iCloud Keychain) will offer to
 * autofill saved credentials AND prompt to save new ones on first login.
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
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
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
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
        <span className="text-xs text-white/70">
          Already have a Tidy account?
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15 transition-all hover:bg-white/15 hover:ring-gold/40"
        >
          <LogIn className="h-3 w-3" />
          Sign in
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleLogin}
      className="space-y-3 rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur-md animate-fade-in"
      autoComplete="on"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Welcome back</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] font-medium text-white/50 hover:text-white/80"
        >
          Cancel
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
        className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40"
      />
      <input
        type="password"
        name="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        required
        className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/40"
      />

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <a
          href="/forgot-password"
          className="text-[11px] font-medium text-white/60 hover:text-white"
        >
          Forgot password?
        </a>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-gold to-gold/85 px-4 py-2 text-xs font-extrabold text-foreground shadow-[0_6px_20px_-6px_hsl(var(--gold)/0.6)] transition-all hover:shadow-[0_10px_24px_-6px_hsl(var(--gold)/0.75)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}
