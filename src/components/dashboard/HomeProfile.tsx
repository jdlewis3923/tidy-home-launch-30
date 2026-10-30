import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { HOME_PROFILE_FIELDS, homeProfileCanAddPhotos, type HomeProfile as Profile } from '@/lib/home-profile';
import { toast } from 'sonner';
import { Camera, Save, Trash2 } from 'lucide-react';

async function compress(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 700 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Photo unavailable');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  let quality = .65;
  let photo = canvas.toDataURL('image/jpeg', quality);
  while (photo.length > 220000 && quality > .2) { quality -= .1; photo = canvas.toDataURL('image/jpeg', quality); }
  if (photo.length > 220000) throw new Error('Photo too large');
  return photo;
}
export default function HomeProfile({ beforeFirstVisit = false }: { beforeFirstVisit?: boolean }) {
  const { language } = useLanguage(); const es = language === 'es';
  const [profile, setProfile] = useState<Profile>({}); const [userId, setUserId] = useState<string>(); const [busy, setBusy] = useState(false);
  useEffect(() => { void (async () => { const { data } = await supabase.auth.getUser(); if (!data.user) return; setUserId(data.user.id); const result = await supabase.from('home_notes').select('profile').eq('user_id', data.user.id).maybeSingle(); if (result.data) setProfile(result.data.profile as Profile); })(); }, []);
  const save = async () => { if (!userId) return; setBusy(true); const { error } = await supabase.from('home_notes').upsert({ user_id: userId, profile: profile as never, updated_at: new Date().toISOString() }); setBusy(false); error ? toast.error(es ? 'No se pudo guardar' : 'Could not save') : toast.success(es ? 'Perfil guardado' : 'Home profile saved'); };
  return <section className="mx-auto max-w-5xl border-y border-border px-6 py-6">
    <h2 className="text-xl font-bold text-foreground">{es ? 'Perfil del hogar' : 'Home profile'} <span className="text-sm font-normal text-muted-foreground">{es ? 'Opcional' : 'Optional'}</span></h2>
    <p className="mt-2 text-sm text-muted-foreground">{beforeFirstVisit ? (es ? 'Antes de tu primera visita, comparte tus preferencias.' : 'Before your first visit, share your preferences.') : (es ? 'Comparte tus preferencias para tu primera visita.' : 'Share your preferences for your first visit.')}</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">{HOME_PROFILE_FIELDS.map(([key, en, sp]) => <label className="text-sm font-medium" key={key}>{es ? sp : en}<Textarea className="mt-2" maxLength={2000} value={profile[key] ?? ''} onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))} /></label>)}</div>
    <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.ownProducts ?? false} onChange={e => setProfile(p => ({ ...p, ownProducts: e.target.checked }))} />{es ? 'Yo suministro los productos' : 'I supply my own products'}</label>
    <label className="mt-4 block text-sm font-medium"><Camera className="mr-2 inline h-4 w-4" />{es ? 'Fotos de habitaciones terminadas (hasta 6)' : 'Finished-room photos (up to 6)'}<Input className="mt-2" type="file" accept="image/*" multiple onChange={async e => { const files = [...(e.target.files ?? [])]; if (!homeProfileCanAddPhotos(profile.photos?.length ?? 0, files.length)) { toast.error(es ? 'Máximo 6 fotos' : 'Maximum 6 photos'); return; } try { const photos = await Promise.all(files.map(compress)); setProfile(p => ({ ...p, photos: [...(p.photos ?? []), ...photos] })); } catch { toast.error(es ? 'No se pudo cargar la foto' : 'Could not load photo'); } e.target.value = ''; }} /></label>
    <div className="mt-4 grid grid-cols-3 gap-3">{profile.photos?.map((src, i) => <figure key={i}><img src={src} alt={es ? 'Habitación terminada' : 'Finished room'} className="aspect-square w-full rounded object-cover" /><Button variant="ghost" size="icon" aria-label={es ? 'Eliminar foto' : 'Remove photo'} onClick={() => setProfile(p => ({ ...p, photos: p.photos?.filter((_, n) => n !== i) }))}><Trash2 className="h-4 w-4" /></Button></figure>)}</div>
    <Button className="mt-4" disabled={busy} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />{es ? 'Guardar perfil' : 'Save home profile'}</Button>
  </section>;
}