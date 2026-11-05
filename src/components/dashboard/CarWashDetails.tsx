/** Car wash details for the car care Pro's job sheet. Shown only when the plan has the Car Wash Add-On. */
import { useEffect, useState } from "react";
import { Car, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import {Button} from '@/components/ui/button';

type Profile = {
  vehicle_make: string; vehicle_model: string; vehicle_color: string; parking_spot: string;
  interior_included: boolean; interior_access: string; gate_code: string; access_note: string; vehicle_plate:string; spigot_at_parking:boolean;
};
const EMPTY: Profile = { vehicle_make: "", vehicle_model: "", vehicle_color: "", parking_spot: "", interior_included: false, interior_access: "", gate_code: "", access_note: "", vehicle_plate:'',spigot_at_parking:false };

export default function CarWashDetails() {
  const { t } = useLanguage();
  const [sub, setSub] = useState<{ id: string; user_id: string } | null>(null);
  const [p, setP] = useState<Profile>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const {data:auth}=await supabase.auth.getUser();if(!auth.user)return;
      const { data: s } = await supabase.from("subscriptions").select("id, user_id, car_wash_key, services")
        .eq('user_id',auth.user.id).in("status", ["active", "paused"]).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(s&&!s.car_wash_key&&!s.services?.includes('detailing'))return;
      if (!s) return;
      setSub({ id: s.id, user_id: s.user_id });
      const { data: c } = await supabase.from("car_wash_profiles").select("*").eq("subscription_id", s.id).maybeSingle();
      if (c) setP({
        vehicle_make: c.vehicle_make ?? "", vehicle_model: c.vehicle_model ?? "", vehicle_color: c.vehicle_color ?? "",
        parking_spot: c.parking_spot ?? "", interior_included: !!c.interior_included, interior_access: c.interior_access ?? "",
        gate_code: '', access_note: c.access_note ?? "",vehicle_plate:c.vehicle_plate??'',spigot_at_parking:!!c.spigot_at_parking,
      });
      const {data:gate}=await supabase.rpc('my_gate_code');setP(previous=>({...previous,gate_code:gate??''}));
    })();
  }, []);
  if (!sub) return null;

  const save = async () => {
    setSaving(true);
    const {gate_code,...details}=p;
    const {error:gateError}=await supabase.rpc('set_my_gate_code',{_code:gate_code||null});
    const { error } = gateError?{error:gateError}:await supabase.from("car_wash_profiles").upsert({ subscription_id: sub.id, user_id: sub.user_id, ...details, updated_at: new Date().toISOString() });
    setSaving(false);
    toast(error ? { title: t("Could not save"), description: error.message, variant: "destructive" } : { title: t("Saved"), description: t("Your car care Pro will see this on the job.") });
  };
  const field = (k: Exclude<keyof Profile, "interior_included"|'spigot_at_parking'>, label: string) => (
    <label className="block text-sm">
      <span className="text-ink-soft">{t(label)}</span>
      <input value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} maxLength={200}
        className="mt-1 w-full rounded-xl border border-[hsl(var(--hairline))] bg-card px-3 py-2 text-ink" />
    </label>
  );

  return (
    <section className="rounded-3xl border border-[hsl(var(--hairline))] bg-card p-6 shadow-sm" data-testid="car-wash-details">
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><Car className="h-4 w-4 text-[hsl(var(--primary))]" /> {t("Your car wash")}</h2>
      <p className="mt-2 text-sm text-ink-soft">
        {t("Your car wash is handled by our car care Pro — a different team member from your cleaner. We'll confirm the day with you.")}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {field("vehicle_make", "Make")}{field("vehicle_model", "Model")}{field("vehicle_color", "Colour")}
        {field('vehicle_plate','License plate')}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("parking_spot", "Where it's usually parked")}{field("gate_code", "Gate code")}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={p.interior_included} onChange={(e) => setP({ ...p, interior_included: e.target.checked })} />
        {t("Include the interior")}
      </label>
      {p.interior_included && <div className="mt-3">{field("interior_access", "How the Pro gets into the car")}</div>}
      <div className="mt-3">{field("access_note", "Any other access note")}</div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={p.spigot_at_parking} onChange={e=>setP({...p,spigot_at_parking:e.target.checked})}/>{t('Spigot at parking')}</label>
      <Button type="button" onClick={save} disabled={saving} className="mt-4">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t("Save car details")}
      </Button>
    </section>
  );
}
