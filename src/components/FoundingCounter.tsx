import { useFoundingCounts, FOUNDING_ZIPS } from '@/hooks/useFoundingCounts';
import { FOUNDING_CAP } from '@/lib/launch';
import { useLanguage } from '@/contexts/LanguageContext';

/** One line: homes reserved in the visitor's ZIP, or the combined total before a ZIP is known. */
export default function FoundingCounter({ tone = 'light', zip }: { tone?: 'light' | 'dark'; zip?: string }) {
  const { data } = useFoundingCounts();
  const { t } = useLanguage();
  if (!data) return null;
  const muted = tone === 'dark' ? 'text-primary-foreground/70' : 'text-ink-faint';
  const strong = tone === 'dark' ? 'text-primary-foreground' : 'text-ink';
  const known = !!zip && (FOUNDING_ZIPS as readonly string[]).includes(zip);
  const n = known ? data.byZip[zip!] : data.total;
  const cap = known ? FOUNDING_CAP : FOUNDING_CAP * FOUNDING_ZIPS.length;
  return (
    <p data-testid="founding-counter" data-count={n} data-zip={known ? zip : 'all'} className={`text-center text-xs ${muted}`}>
      {known && n >= FOUNDING_CAP
        ? <>{t('The founding group in')} <span className={`font-semibold ${strong}`}>{zip}</span> {t('is full · waitlist open')}</>
        : <><span className={`font-semibold ${strong}`}>{n} {t('of')} {cap}</span> {t('founding homes reserved')} {known ? <>{t('in')} {zip}</> : <>{t('across')} {FOUNDING_ZIPS.join(', ')}</>}</>}
    </p>
  );
}
