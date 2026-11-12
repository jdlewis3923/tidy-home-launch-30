import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { House, Leaf, Car, ArrowRight } from 'lucide-react';
import TidyLogo from '@/components/TidyLogo';
import SeoHead from '@/components/landing/SeoHead';
import { type ApplyService } from '@/lib/connecteamApply';
import { Button } from '@/components/ui/button';

const CARDS: { key: ApplyService; icon: typeof House; en: string; es: string; pay: { en: string; es: string }[] }[] = [
  { key: 'cleaning', icon: House, en: 'House Cleaning', es: 'Limpieza de casas', pay: [{ en: '$56–$112 per home', es: '$56–$112 por casa' }] },
  { key: 'lawn', icon: Leaf, en: 'Lawn Care', es: 'Cuidado del césped', pay: [{ en: '$18–$40 per yard', es: '$18–$40 por jardín' }] },
  { key: 'car', icon: Car, en: 'Car Care', es: 'Cuidado de autos', pay: [{ en: '$16–$26 per wash', es: '$16–$26 por lavado' }, { en: '$78–$115 per full detail', es: '$78–$115 por detallado completo' }] },
];

export default function Apply() {
  const [params] = useSearchParams();
  const [lang, setLang] = useState<'en' | 'es'>(() => (navigator.language.startsWith('es') ? 'es' : 'en'));
  const t = (en: string, es: string) => (lang === 'es' ? es : en);

  return (
    <div className="min-h-screen bg-navy text-primary-foreground">
      <SeoHead title="Apply to Tidy | Pro jobs in Pinecrest & Kendall" description="Cleaning, lawn and car care Pro jobs in Pinecrest & Kendall. Paid every Friday. Habla español." canonical="https://jointidy.co/apply" />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link to="/" aria-label="Tidy"><TidyLogo size="sm" /></Link>
        <Button variant="ghost" type="button" onClick={() => setLang(lang === 'en' ? 'es' : 'en')} className="rounded-full border border-primary-foreground/40 px-4 py-1.5 text-sm">
          {lang === 'en' ? 'Español' : 'English'}
        </Button>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-6">
        <h1 className="text-center text-3xl font-bold md:text-4xl">{t('Work with Tidy', 'Trabaja con Tidy')}</h1>
        <p className="mt-3 text-center text-primary-foreground/80">
          {t('Paid every Friday · Pinecrest & Kendall · Habla español', 'Pago cada viernes · Pinecrest y Kendall · Habla español')}
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {CARDS.map(({ key, icon: Icon, en, es, pay }) => (
            <section key={key} className="flex flex-col rounded-2xl border border-primary-foreground/15 bg-navy-deep p-6">
              <Icon className="h-9 w-9 text-gold" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold">{t(en, es)}</h2>
              <ul className="mt-3 space-y-1 text-primary-foreground/85">
                {pay.map((p) => <li key={p.en}>{t(p.en, p.es)}</li>)}
              </ul>
              <p className="mt-2 text-sm text-primary-foreground/60">{t('Paid every Friday', 'Pago cada viernes')}</p>
              <Button asChild className="mt-6 min-h-[54px] rounded-full bg-gold px-5 text-base font-semibold text-gold-foreground shadow-lg hover:bg-gold hover:brightness-105"><Link to={`/apply/${key}${params.get('src') ? `?src=${encodeURIComponent(params.get('src')!)}` : ''}`}>
                {t('Apply now', 'Aplica ahora')} <ArrowRight className="h-5 w-5" aria-hidden />
              </Link></Button>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
