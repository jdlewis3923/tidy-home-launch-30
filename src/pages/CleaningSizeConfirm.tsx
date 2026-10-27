import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import TidyLogo from '@/components/TidyLogo';

type Offer = { size: string; sqft: number; bathrooms: number; old_cents: number | null; new_cents: number; confirmation: string };
export default function CleaningSizeConfirm() {
  const { token = '' } = useParams();
  const { language } = useLanguage();
  const es = language === 'es';
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.rpc('cleaning_size_offer', { _token: token }).then(({ data, error }) => {
      if (!active) return;
      setOffer(!error && data ? data as unknown as Offer : null); setLoading(false);
    });
    return () => { active = false; };
  }, [token]);
  const money = (c: number) => new Intl.NumberFormat(es ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
  async function respond(accept: boolean) {
    setBusy(true); setError(false);
    const { data, error } = await supabase.rpc('cleaning_size_respond', { _token: token, _accept: accept });
    setBusy(false);
    if (error || !data) { setError(true); return; }
    setOffer(prev => prev ? { ...prev, confirmation: accept ? 'confirmed' : 'declined' } : null);
  }
  return <main className="min-h-screen bg-background px-4 py-10 text-foreground">
    <Helmet><title>{es ? 'Confirmar tamaño de limpieza' : 'Confirm cleaning size'} | Tidy</title><meta name="robots" content="noindex" /></Helmet>
    <div className="mx-auto max-w-lg space-y-6">
      <TidyLogo size="md" />
      <h1 className="text-2xl font-bold">{es ? 'Confirma el tamaño de tu hogar' : 'Confirm your home size'}</h1>
      {loading ? <p>{es ? 'Cargando…' : 'Loading…'}</p> : !offer ? <p>{es ? 'Este enlace ya no está activo. Llámanos al (786) 829-1141.' : 'This link is no longer active. Call (786) 829-1141.'}</p> : offer.confirmation === 'pending' ? <>
        <p>{es ? 'Verificamos' : 'We verified'} {offer.sqft.toLocaleString()} {es ? 'pies cuadrados y' : 'sq ft and'} {offer.bathrooms} {es ? 'baños.' : 'bathrooms.'}</p>
        <p className="text-lg font-semibold">{es ? 'Limpieza:' : 'Cleaning:'} {money(offer.new_cents)}{es ? '/mes' : '/month'}{offer.old_cents != null && <span className="block text-sm font-normal text-muted-foreground">{es ? 'Antes:' : 'Previously:'} {money(offer.old_cents)}{es ? '/mes' : '/month'}</span>}</p>
        <p>{es ? 'No cobraremos el precio mayor sin tu aprobación. Confirmar no realiza ningún cobro.' : 'We will not charge the higher price without your approval. Confirming does not charge you.'}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button disabled={busy} onClick={() => respond(true)}>{es ? 'Aceptar tamaño y precio' : 'Accept size and price'}</Button>
          <Button variant="outline" disabled={busy} onClick={() => respond(false)}>{es ? 'No aceptar' : 'Decline'}</Button>
        </div>
      </> : <p role="status">{offer.confirmation === 'confirmed' ? (es ? 'Confirmado. Tu reserva refleja el tamaño verificado. No se ha realizado ningún cobro.' : 'Confirmed. Your reservation reflects the verified size. Nothing has been charged.') : (es ? 'No aceptado. La limpieza permanece en espera. Llámanos para revisar las opciones. No se ha realizado ningún cobro.' : 'Declined. Cleaning remains on hold. Call us to discuss options. Nothing has been charged.')}</p>}
      {error && <p role="alert" className="text-destructive">{es ? 'No pudimos guardar tu respuesta. Vuelve a intentarlo o llámanos.' : 'We could not save your response. Try again or call us.'}</p>}
    </div>
  </main>;
}