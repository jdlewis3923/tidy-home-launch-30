/**
 * Tidy — Car service slot picker.
 *
 * Car Wash and Car Detail get their own time election: a Wash offers a slot
 * every 60 minutes across the whole service day, while a Detail only offers
 * starts that leave a contiguous `duration_minutes` block free before the
 * service day ends (so a 3.5-hour detail can never start at 4pm). Durations
 * come from the admin-editable app_settings row for the variant, falling
 * back to the pricing-canon default.
 */
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  CAR_SERVICE_DEFAULT_DURATION_MINUTES,
  CAR_SERVICE_DURATION_SETTINGS_KEY,
  CAR_SERVICE_NAMES,
  type CarServiceCode,
} from '@/lib/pricing-canon';

// The working day every Pro operates within. Not (yet) admin-editable —
// only the per-variant duration is, per the pricing-canon config keys.
export const SERVICE_DAY_START_MINUTES = 8 * 60; // 8:00 AM
export const SERVICE_DAY_END_MINUTES = 18 * 60; // 6:00 PM
export const SLOT_STEP_MINUTES = 60;

export function formatMinutes(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Slot starts for a car variant given its duration:
 *  - car_wash: every SLOT_STEP_MINUTES across the full service day.
 *  - car_detail: only starts that leave a full `duration_minutes` block
 *    free — i.e. stop offering starts after (service_day_end - duration).
 */
export function buildCarSlots(carServiceCode: CarServiceCode, durationMinutes: number): number[] {
  const latestStart =
    carServiceCode === 'car_wash'
      ? SERVICE_DAY_END_MINUTES - SLOT_STEP_MINUTES
      : SERVICE_DAY_END_MINUTES - durationMinutes;
  const slots: number[] = [];
  for (let t = SERVICE_DAY_START_MINUTES; t <= latestStart; t += SLOT_STEP_MINUTES) {
    slots.push(t);
  }
  return slots;
}

/** Reads the admin-editable duration override, falling back to the canon default. */
export function useCarServiceDuration(carServiceCode: CarServiceCode | null): number {
  const [minutes, setMinutes] = useState<number>(
    carServiceCode ? CAR_SERVICE_DEFAULT_DURATION_MINUTES[carServiceCode] : 0,
  );

  useEffect(() => {
    if (!carServiceCode) return;
    let cancelled = false;
    const key = CAR_SERVICE_DURATION_SETTINGS_KEY[carServiceCode];
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const raw = data?.value;
        const parsed = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
        setMinutes(Number.isFinite(parsed) && parsed > 0 ? parsed : CAR_SERVICE_DEFAULT_DURATION_MINUTES[carServiceCode]);
      });
    return () => {
      cancelled = true;
    };
  }, [carServiceCode]);

  return minutes;
}

interface Props {
  carServiceCode: CarServiceCode;
  value: number | null;
  onChange: (startMinutes: number) => void;
}

export default function CarSlotPicker({ carServiceCode, value, onChange }: Props) {
  const { t } = useLanguage();
  const durationMinutes = useCarServiceDuration(carServiceCode);
  const slots = buildCarSlots(carServiceCode, durationMinutes);
  const finish = value != null ? value + durationMinutes : null;

  return (
    <div className="rounded-2xl border border-[hsl(var(--hairline))] bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Clock className="h-4 w-4 text-[hsl(var(--primary))]" />
        {t('Pick your arrival time')} — {t(CAR_SERVICE_NAMES[carServiceCode])}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {slots.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => onChange(slot)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              value === slot
                ? 'bg-ink text-white'
                : 'bg-cream text-ink-soft hover:bg-cream-deep/40'
            }`}
          >
            {formatMinutes(slot)}
          </button>
        ))}
      </div>
      {finish != null && (
        <p className="mt-3 text-xs text-ink-soft">
          {t('Done by ~{time}').replace('{time}', formatMinutes(finish))}
        </p>
      )}
    </div>
  );
}
