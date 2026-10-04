ALTER TABLE public.addon_catalog ADD COLUMN IF NOT EXISTS lookup_key text UNIQUE;
ALTER TABLE public.addon_catalog ADD COLUMN IF NOT EXISTS gift_eligible boolean NOT NULL DEFAULT false;

-- Laundry is uncanonical; the five below fail the every-Pro-can-deliver test. Records kept, switched off.
UPDATE public.addon_catalog SET is_active = false, gift_eligible = false, updated_at = now()
 WHERE addon_key IN ('laundry_wdf','deep_baseboard_scrub','inside_kitchen_cabinets','exterior_windows_screens','headlight_restoration','driveway_pressure_wash');
UPDATE public.stripe_catalog SET active = false
 WHERE is_addon AND addon_name IN ('laundry','baseboards','cabinets','exteriorWindows','headlightRestoration','pressureWash');

-- Gift pool: live add-ons priced $55 and under, except Bed Edge Reset.
UPDATE public.addon_catalog SET gift_eligible = (addon_key IN (
  'inside_oven_clean','inside_fridge_clean','interior_windows','weed_removal',
  'leaf_debris_cleanup','pet_hair_removal','interior_protect_condition')), updated_at = now();

UPDATE public.addon_catalog SET display_name = 'Weed Removal — Garden Beds', updated_at = now() WHERE addon_key = 'weed_removal';