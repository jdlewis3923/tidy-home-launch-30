import { useState } from 'react';
import { ConfigState, VALID_ZIPS } from '@/lib/dashboard-pricing';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, MapPin } from 'lucide-react';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
  /** Called when the ZIP is in service area and the user is ready to advance. */
  onValid: () => void;
}

/**
 * Pre-step ZIP gate. If the ZIP is in our launch area, we store it and
 * advance to the service picker. If it's outside, we swap to a calm
 * waitlist UI and capture an email into public.waitlist.
 *
 * Mobile-first: single column, 44px+ tap targets, autofocus on mount.
 */
export default function StepZipGate({ state, onChange, onValid }: Props) {
  const [zip, setZip] = useState(state.zip || '');
  const [email, setEmail] = useState('');
  const [outOfArea, setOutOfArea] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleZipSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (zip.length !== 5 || !/^\d{5}$/.test(zip)) {
      setError('Please enter a valid 5-digit ZIP.');
      return;
    }
    if (VALID_ZIPS.includes(zip)) {
      onChange({ ...state, zip, outOfCoverage: false });
      onValid();
    } else {
      onChange({ ...state, zip, outOfCoverage: true });
      setOutOfArea(true);
    }
  };

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email.');
      return;
    }
    setSubmitting(true);
    const { error: insertErr } = await supabase
      .from('waitlist')
      .insert({ email: email.trim().toLowerCase(), zip, source: 'signup_zip_gate' });
    setSubmitting(false);
    if (insertErr) {
      setError("Couldn't save — try again in a moment.");
      return;
    }
    setWaitlisted(true);
  };

  // ─── Out-of-area waitlist confirmation ───────────────────────────
  if (waitlisted) {
    return (
      <div className="space-y-4 animate-calm-in">
        <div className="rounded-2xl border border-hairline bg-white p-6 text-center shadow-[0_8px_32px_-16px_hsl(var(--ink)/0.18)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 ring-1 ring-gold/40">
            <CheckCircle2 className="h-6 w-6 text-gold" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-ink">You're on the list.</h3>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed">
            We'll email you the moment Tidy reaches {zip}. No spam — one note when we expand.
          </p>
        </div>
      </div>
    );
  }

  // ─── Out-of-area waitlist capture ────────────────────────────────
  if (outOfArea) {
    return (
      <form onSubmit={handleWaitlist} className="space-y-5 animate-calm-in">
        <div className="rounded-2xl border border-hairline bg-white p-5">
          <p className="text-sm font-semibold text-ink">
            We're not in {zip} yet.
          </p>
          <p className="mt-1.5 text-[13px] text-ink-soft leading-relaxed">
            We launched in Pinecrest + Kendall first. Drop your email and we'll alert you the moment we expand to your area.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            Email
          </label>
          <input
            type="email"
            inputMode="email"
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-base text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
            style={{ minHeight: 48 }}
          />
        </div>

        {error && <p className="text-[12px] text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setOutOfArea(false); setZip(''); }}
            className="text-sm font-medium text-ink-faint hover:text-ink transition-colors"
            style={{ minHeight: 44 }}
          >
            ← try another zip
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="ml-auto rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_hsl(var(--ink)/0.55)] transition-all hover:-translate-y-0.5 disabled:opacity-50"
            style={{ minHeight: 44 }}
          >
            {submitting ? 'saving…' : 'notify me'}
          </button>
        </div>
      </form>
    );
  }

  // ─── ZIP entry ───────────────────────────────────────────────────
  return (
    <form onSubmit={handleZipSubmit} className="space-y-5 animate-calm-in">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Your ZIP code
        </label>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            autoFocus
            autoComplete="postal-code"
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="33156"
            className="w-full rounded-lg border border-hairline bg-white pl-10 pr-4 py-3 text-base text-ink placeholder:text-ink-faint/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
            style={{ minHeight: 48 }}
          />
        </div>
        <p className="text-[11px] text-ink-faint">
          We're live in 33156, 33183, 33186. Drop your zip — we'll go from there.
        </p>
      </div>

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={zip.length !== 5}
        className="ml-auto block rounded-xl bg-ink px-7 py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_hsl(var(--ink)/0.55)] transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
        style={{ minHeight: 44 }}
      >
        check my area →
      </button>
    </form>
  );
}
