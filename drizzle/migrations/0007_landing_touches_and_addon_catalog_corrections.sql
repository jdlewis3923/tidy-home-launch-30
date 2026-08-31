-- 1) Server-side door-hanger attribution. localStorage is only a fallback.
CREATE TABLE IF NOT EXISTS public.landing_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_source text NOT NULL,
  placement text,
  zip text,
  lang text,
  path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  user_agent text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.landing_touches TO anon, authenticated;
GRANT ALL ON public.landing_touches TO service_role;

ALTER TABLE public.landing_touches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landing_touches anon insert" ON public.landing_touches;
CREATE POLICY "landing_touches anon insert"
  ON public.landing_touches FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "landing_touches admin read" ON public.landing_touches;
CREATE POLICY "landing_touches admin read"
  ON public.landing_touches FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_landing_touches_created ON public.landing_touches (created_at DESC);

-- 2) Add-on catalog corrections: retire hedge trimming and fertilization,
--    add Bed Edge Reset and Exterior Windows & Screens, mark the pressure wash
--    as specialist so it stays out of the free monthly add-on gift pool.
ALTER TABLE public.addon_catalog
  ADD COLUMN IF NOT EXISTS is_specialist boolean NOT NULL DEFAULT false;

UPDATE public.addon_catalog SET is_active = false
 WHERE addon_key IN ('hedge_bush_trimming', 'fertilization_treatment');

UPDATE public.addon_catalog SET is_specialist = true
 WHERE addon_key = 'driveway_pressure_wash';

INSERT INTO public.addon_catalog (addon_key, display_name, price_cents, services, lucide_icon, sort_order, stripe_price_id)
VALUES
  ('bed_edge_reset', 'Bed Edge Reset', 6500, ARRAY['lawn'], 'scissors', 110, 'price_1UAVSJD7AxvAjJGvk6jf0gdG'),
  ('exterior_windows_screens', 'Exterior Windows & Screens', 8500, ARRAY['lawn'], 'rectangle-vertical', 140, 'price_1UAVSJD7AxvAjJGvx0aKd0hF')
ON CONFLICT (addon_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      price_cents = EXCLUDED.price_cents,
      services = EXCLUDED.services,
      lucide_icon = EXCLUDED.lucide_icon,
      sort_order = EXCLUDED.sort_order,
      stripe_price_id = EXCLUDED.stripe_price_id,
      is_active = true;

-- 3) Same corrections in the Stripe catalog mirror.
UPDATE public.stripe_catalog SET active = false
 WHERE is_addon = true AND addon_name IN ('hedge', 'fertilization');

INSERT INTO public.stripe_catalog
  (service_type, frequency, lookup_key, size, unit, quantity_rule, per_visit, is_addon, addon_name, stripe_price_id, price_cents, description, sort_order, active)
VALUES
  (NULL, NULL, 'addon_bed_edge_reset', NULL, 'one_time', 'always_1', false, true, 'bedEdgeReset', 'price_1UAVSJD7AxvAjJGvk6jf0gdG', 6500, 'Bed Edge Reset', 300, true),
  (NULL, NULL, 'addon_exterior_windows_screens', NULL, 'one_time', 'always_1', false, true, 'exteriorWindows', 'price_1UAVSJD7AxvAjJGvx0aKd0hF', 8500, 'Exterior Windows & Screens', 303, true)
ON CONFLICT (stripe_price_id) DO UPDATE
  SET price_cents = EXCLUDED.price_cents,
      description = EXCLUDED.description,
      addon_name = EXCLUDED.addon_name,
      lookup_key = EXCLUDED.lookup_key,
      active = true;

-- 4) Chatbot knowledge: retired add-ons out, new ones in, bundling reworded to
--    the free premium add-on (no car-wash gift, no percentage discount).
UPDATE public.chatbot_knowledge SET content = replace(
  content,
  E'Hedge & Bush Trim — $65\nWeed Removal — $45\nLeaf & Debris Cleanup — $55\nFertilization — $75\nDriveway Pressure Wash — $150',
  E'Weed Removal — $45\nLeaf & Debris Cleanup — $55\nBed Edge Reset — $65\nExterior Windows & Screens — $85\nDriveway Pressure Wash — $150 (specialist work, never part of the free monthly add-on)'
);

UPDATE public.chatbot_knowledge SET content = replace(
  content,
  'There is no percentage discount and no promo code. Bundling is a GIFT instead: 2 services = 1 free car wash every month. All 3 services = 2 free car washes every month. It is applied automatically at checkout.',
  'There is no percentage discount and no promo code. Bundling is a GIFT instead: hold two or more services and you pick one free premium add-on every month — your choice from the add-on list, except the Driveway Pressure Wash, which is specialist work. It is applied automatically at checkout, no code needed. There is no three-service tier.'
);

UPDATE public.chatbot_knowledge SET content = replace(
  content,
  'There is no "Palm Frond Trim" and no "Clay Bar Treatment".',
  'There is no "Palm Frond Trim", no "Clay Bar Treatment", no "Hedge & Bush Trimming" and no "Fertilization Treatment" — the last two are retired.'
);
