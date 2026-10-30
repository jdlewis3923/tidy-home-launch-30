import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { HOME_PROFILE_FIELDS, type HomeProfile } from '@/lib/home-profile';
export default function ProHomeProfile({ visitId }: { visitId: string }) {
  const { language } = useLanguage(); const es = language === 'es';
  const [profile, setProfile] = useState<HomeProfile | null>(null);
  useEffect(() => { void supabase.rpc('pro_home_profile', { _visit: visitId }).then(({ data }) => setProfile(data as HomeProfile | null)); }, [visitId]);
  if (!profile || !Object.keys(profile).length) return null;
  return <section className="mt-3 border-y border-border py-4"><h2 className="font-bold text-foreground">{es ? 'Perfil del hogar' : 'Home profile'}</h2><dl className="mt-3 space-y-3">{HOME_PROFILE_FIELDS.filter(([key]) => profile[key]).map(([key, en, sp]) => <div key={key}><dt className="text-sm font-semibold">{es ? sp : en}</dt><dd className="whitespace-pre-wrap text-sm text-muted-foreground">{profile[key]}</dd></div>)}</dl><p className="mt-3 text-sm">{profile.ownProducts ? (es ? 'El miembro suministra productos' : 'Member supplies products') : (es ? 'Usa tus productos seguros para las superficies' : 'Use your surface-safe products')}</p><div className="mt-3 grid grid-cols-3 gap-2">{profile.photos?.map((src, i) => <img key={i} src={src} alt={es ? 'Preferencia de habitación' : 'Room preference'} className="aspect-square w-full rounded object-cover" />)}</div></section>;
}