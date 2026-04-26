import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import tidyLogo from '@/assets/tidy-logo.png';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.location.hash.includes('type=recovery')) navigate('/login');
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('passwords do not match.'); return; }
    setLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) setError(updateError.message);
      else { setSuccess(true); setTimeout(() => navigate('/dashboard'), 1500); }
    } catch {
      setError('reset service is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="relative min-h-screen overflow-hidden bg-cream text-ink flex items-center justify-center px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(36_60%_94%)_0%,hsl(36_27%_96%)_55%,hsl(35_22%_92%)_100%)]" />
      </div>
      <div className="w-full max-w-md space-y-8 animate-calm-rise">{children}</div>
    </div>
  );

  if (success) {
    return (
      <Shell>
        <div className="text-center">
          <img src={tidyLogo} alt="Tidy" className="h-32 md:h-36 w-auto mx-auto drop-shadow-[0_8px_24px_rgba(15,23,42,0.12)]" />
          <h1 className="mt-6 text-3xl font-bold text-ink lowercase tracking-tight">password updated.</h1>
          <p className="mt-2 text-sm text-ink-faint lowercase">redirecting to your dashboard…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center">
        <img src={tidyLogo} alt="Tidy" className="h-32 md:h-36 w-auto mx-auto drop-shadow-[0_8px_24px_rgba(15,23,42,0.12)]" />
        <h1 className="mt-6 text-3xl font-bold text-ink lowercase tracking-tight" style={{ letterSpacing: '-0.025em' }}>
          set a new password.
        </h1>
        <p className="mt-2 text-sm text-ink-faint lowercase">at least 8 characters.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">new password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="min. 8 characters"
            autoComplete="new-password"
            minLength={8}
            className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">confirm password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="re-enter password"
            autoComplete="new-password"
            minLength={8}
            className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
            required
          />
        </div>

        {error && <p className="text-xs text-destructive lowercase">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-ink px-6 py-4 text-sm font-semibold text-white lowercase shadow-[0_14px_40px_-12px_hsl(var(--ink)/0.5)] transition-all hover:shadow-[0_22px_48px_-12px_hsl(var(--ink)/0.6)] hover:-translate-y-0.5 disabled:opacity-50"
        >
          {loading ? 'updating…' : 'update password'}
        </button>
      </form>
    </Shell>
  );
}
