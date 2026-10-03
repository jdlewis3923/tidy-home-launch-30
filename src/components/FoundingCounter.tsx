import { useFoundingCounts } from '@/hooks/useFoundingCounts';
import { FOUNDING_CAP, RESERVABLE_SERVICES, RESERVATION_SERVICE_LABEL } from '@/lib/launch';
import { useLanguage } from '@/contexts/LanguageContext';

/** "[N] of 25 founding spots reserved" per service, straight from the database. */
export default function FoundingCounter({ tone = 'light', services = RESERVABLE_SERVICES as unknown as string[] }: { tone?: 'light' | 'dark'; services?: string[] }) {
  const { data } = useFoundingCounts();
  const { t } = useLanguage();
  if (!data) return null;
  const muted = tone === 'dark' ? 'text-primary-foreground/70' : 'text-ink-faint';
  const strong = tone === 'dark' ? 'text-primary-foreground' : 'text-ink';
  return (
    <ul data-testid="founding-counter" className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs ${muted}`}>
      {services.map((s) => {
        const n = data[s as keyof typeof data] ?? 0;
        return (
          <li key={s} data-service={s} data-count={n}>
            <span className={`font-semibold ${strong}`}>{t(RESERVATION_SERVICE_LABEL[s as keyof typeof RESERVATION_SERVICE_LABEL])}</span>{' '}
            {n >= FOUNDING_CAP
              ? t('founding group full · waitlist open')
              : <>{n} {t('of')} {FOUNDING_CAP} {t('founding spots reserved')}</>}
          </li>
        );
      })}
    </ul>
  );
}
