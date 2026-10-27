import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { MEMBER_GUIDE, MEMBER_GUIDE_INTRO } from '@/lib/memberGuide';
import TidyLogo from '@/components/TidyLogo';

export default function MemberGuide() {
  return <main className="min-h-screen bg-background text-foreground">
    <Helmet><title>Tidy Member Guide | Guía para miembros</title><meta name="description" content="Your Tidy membership schedule, access, rescheduling, weather and billing policies in English and Spanish." /></Helmet>
    <div className="mx-auto max-w-3xl px-5 py-12">
      <Link to="/dashboard"><TidyLogo size="md" /></Link>
      {(['en', 'es'] as const).map(lang => <article lang={lang} key={lang} className="mt-10 space-y-8 border-t border-border pt-8">
        <h1 className="text-3xl font-bold">{lang === 'en' ? 'TIDY MEMBER GUIDE' : 'GUÍA PARA MIEMBROS DE TIDY'}</h1>
        <p className="text-muted-foreground">{MEMBER_GUIDE_INTRO[lang].replace(lang === 'en' ? 'TIDY MEMBER GUIDE ' : 'GUÍA PARA MIEMBROS DE TIDY ', '')}</p>
        {MEMBER_GUIDE.map(section => <section key={section.id} id={`${section.id}${lang === 'es' ? '-es' : ''}`} className="scroll-mt-8">
          <h2 className="mb-3 text-lg font-bold">{section[lang].heading}</h2>
          <ul className="list-disc space-y-2 pl-5 leading-relaxed">{section[lang].items.map(item => <li key={item}>{item}</li>)}</ul>
        </section>)}
      </article>)}
    </div>
  </main>;
}