import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import CalmShell from '@/components/dashboard/CalmShell';
import FoundingCounter from '@/components/FoundingCounter';
import { LAUNCH_DATE_LONG, LAUNCH_MONTH, RESERVATION_SERVICE_LABEL, type ReservableService } from '@/lib/launch';
import { RESERVE_RESULT_KEY } from '@/components/dashboard/steps/StepReserve';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Reserved() {
  const { t } = useLanguage();
  let r: { first?: string; services?: ReservableService[]; waitlist?: ReservableService[] } = {};
  try { r = JSON.parse(sessionStorage.getItem(RESERVE_RESULT_KEY) ?? '{}'); } catch { /* ignore */ }
  const waitlist = r.waitlist ?? [];
  const reserved = (r.services ?? []).filter((s) => !waitlist.includes(s));
  const steps = [
    [t('Now'), t('we hold your spot and your preferred day.')],
    [t(`Early ${LAUNCH_MONTH}`), t('we confirm your pro, your day and your time window, and you add a card. Nothing charges until your first visit.')],
    [t(LAUNCH_DATE_LONG), t('your first visit.')],
  ];
  return (
    <CalmShell step={0} totalSteps={0} microcopy="">
      <div className="rounded-3xl border border-hairline bg-white p-8 md:p-10 shadow-[0_4px_20px_rgba(15,23,42,0.04)]" data-testid="reserved-screen">
        <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden />
        <h1 className="mt-4 text-3xl font-bold text-ink" style={{ letterSpacing: '-0.025em' }}>
          {reserved.length || !waitlist.length ? t("You're reserved.") : t("You're on the waitlist.")}
        </h1>
        {waitlist.length > 0 && (
          <p className="mt-2 text-sm text-ink-soft">{t(`The founding group for ${waitlist.map((s) => RESERVATION_SERVICE_LABEL[s]).join(' and ')} is full — you're on the waitlist for it.`)}</p>
        )}
        <p className="mt-6 text-sm font-semibold text-ink">{t("Here's what happens next:")}</p>
        <ol className="mt-3 divide-y divide-hairline border-y border-hairline">
          {steps.map(([w, d]) => (
            <li key={w} className="flex gap-4 py-3 text-sm"><span className="w-36 shrink-0 font-semibold text-ink">{w}</span><span className="text-ink-soft">— {d}</span></li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-ink-soft">
          {t('Questions any time:')} <a className="underline" href="mailto:hello@jointidy.co">hello@jointidy.co</a> {t('or')} <a className="underline" href="tel:+17868291141">(786) 829-1141</a>.
        </p>
        <div className="mt-6"><FoundingCounter /></div>
        <Link to="/" className="mt-6 inline-block text-xs font-medium text-ink-faint underline underline-offset-4">{t('Back to home')}</Link>
      </div>
    </CalmShell>
  );
}
