import { useState } from 'react';
import { ConfigState, VALID_ZIPS } from '@/lib/dashboard-pricing';
import { supabase } from '@/integrations/supabase/client';
import { MapPin } from 'lucide-react';
import WaitlistCapture from '@/components/dashboard/WaitlistCapture';

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
  const [outOfArea, setOutOfArea] = useState(false);
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

  // ─── Out-of-area waitlist capture (shared component) ────────────
  if (outOfArea) {
    return (
      <WaitlistCapture
        zip={zip}
        source="signup_zip_gate"
        onReset={() => { setOutOfArea(false); setZip(''); }}
      />
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
