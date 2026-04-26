import { useState } from 'react';
import { Link } from 'react-router-dom';
import tidyLogo from '@/assets/tidy-logo.png';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('please enter your email.'); return; }
    setLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) setError(resetError.message);
      else setSent(true);
    } catch {
      setError('reset service is unavailable. try again later.');
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

  if (sent) {
    return (
      <Shell>
        <div className="text-center">
          <img src={tidyLogo} alt="Tidy" className="h-32 md:h-36 w-auto mx-auto drop-shadow-[0_8px_24px_rgba(15,23,42,0.12)]" />
          <h1 className="mt-6 text-3xl font-bold text-ink lowercase tracking-tight" style={{ letterSpacing: '-0.025em' }}>
            check your email.
          </h1>
          <p className="mt-3 text-sm text-ink-soft">
            we sent a reset link to <span className="text-ink font-semibold">{email}</span>.
          </p>
          <Link to="/login" className="mt-8 inline-block text-xs text-ink-faint hover:text-ink lowercase">← back to sign in</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center">
        <img src={tidyLogo} alt="Tidy" className="h-32 md:h-36 w-auto mx-auto drop-shadow-[0_8px_24px_rgba(15,23,42,0.12)]" />
        <h1 className="mt-6 text-3xl font-bold text-ink lowercase tracking-tight" style={{ letterSpacing: '-0.025em' }}>
          reset your password.
        </h1>
        <p className="mt-2 text-sm text-ink-faint lowercase">we'll send a reset link.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
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
          {loading ? 'sending…' : 'send reset link'}
        </button>

        <div className="text-center">
          <Link to="/login" className="text-xs text-ink-faint hover:text-ink lowercase">← back to sign in</Link>
        </div>
      </form>
    </Shell>
  );
}
