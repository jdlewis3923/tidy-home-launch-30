import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  /** ZIP the customer entered (stored with the waitlist row). */
  zip: string;
  /** Where the signup came from — written to waitlist.source. */
  source: string;
  /** Called when the customer wants to try a different ZIP. */
  onReset: () => void;
}

/**
 * Shared out-of-area waitlist capture. Used by the signup wizard ZIP gate
 * and by the homepage ZIP checker so there is only one implementation.
 */
export default function WaitlistCapture({ zip, source, onReset }: Props) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('Please enter a valid email.'));
      return;
    }
    setSubmitting(true);
    // Written server-side: the client has no INSERT grant on public.waitlist.
    const { data, error: invokeErr } = await supabase.functions.invoke('submit-waitlist', {
      body: { email: email.trim().toLowerCase(), zip, source },
    });
    setSubmitting(false);
    if (invokeErr || !(data as { ok?: boolean } | null)?.ok) {
      console.error('[submit-waitlist]', invokeErr?.message ?? data);
      setError(t("Couldn't save — try again in a moment."));
      return;
    }
    setWaitlisted(true);
  };


  if (waitlisted) {
    return (
      <div className="space-y-4 animate-calm-in">
        <div className="rounded-2xl border border-hairline bg-white p-6 text-center shadow-[0_8px_32px_-16px_hsl(var(--ink)/0.18)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 ring-1 ring-gold/40">
            <CheckCircle2 className="h-6 w-6 text-gold" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-ink">{t("You're on the list.")}</h3>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed">
            {t("We'll email you the moment Tidy reaches")} {zip}. {t('No spam — one note when we expand.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleWaitlist} className="space-y-5 animate-calm-in">
      <div className="rounded-2xl border border-hairline bg-white p-5">
        <p className="text-sm font-semibold text-ink">
          {t("We're not in")} {zip} {t('yet.')}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-soft leading-relaxed">
          {t("We launched in Pinecrest + Kendall first. Drop your email and we'll alert you the moment we expand to your area.")}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          {t('Email')}
        </label>
        <input
          type="email"
          inputMode="email"
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
          onClick={onReset}
          className="text-sm font-medium text-ink-faint hover:text-ink transition-colors"
          style={{ minHeight: 44 }}
        >
          {t('← try another zip')}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="ml-auto rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_hsl(var(--ink)/0.55)] transition-all hover:-translate-y-0.5 disabled:opacity-50"
          style={{ minHeight: 44 }}
        >
          {submitting ? t('saving…') : t('notify me')}
        </button>
      </div>
    </form>
  );
}
