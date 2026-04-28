-- 1) Catalog table
CREATE TABLE public.addon_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  services text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  stripe_product_id text,
  stripe_price_id text,
  sort_order integer NOT NULL DEFAULT 0,
  lucide_icon text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_addon_catalog_active_sort ON public.addon_catalog (is_active, sort_order);
CREATE INDEX idx_addon_catalog_services ON public.addon_catalog USING GIN (services);

-- 2) RLS
ALTER TABLE public.addon_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "addon_catalog read active"
  ON public.addon_catalog
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "addon_catalog admin select all"
  ON public.addon_catalog
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "addon_catalog admin write"
  ON public.addon_catalog
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) updated_at trigger
CREATE TRIGGER trg_addon_catalog_updated_at
  BEFORE UPDATE ON public.addon_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Seed 15 add-ons
INSERT INTO public.addon_catalog (addon_key, display_name, price_cents, services, lucide_icon, sort_order) VALUES
  ('inside_oven_clean',        'Inside Oven Clean',        4500,  ARRAY['cleaning'], 'flame',              10),
  ('inside_fridge_clean',      'Inside Fridge Clean',      3500,  ARRAY['cleaning'], 'snowflake',          20),
  ('interior_windows',         'Interior Windows',         5500,  ARRAY['cleaning'], 'rectangle-vertical', 30),
  ('deep_baseboard_scrub',     'Deep Baseboard Scrub',     3500,  ARRAY['cleaning'], 'minus',              40),
  ('laundry_wdf',              'Laundry W/D/F',            3000,  ARRAY['cleaning'], 'shirt',              50),
  ('inside_kitchen_cabinets',  'Inside Kitchen Cabinets',  5000,  ARRAY['cleaning'], 'archive',            60),
  ('hedge_bush_trimming',      'Hedge & Bush Trimming',    6500,  ARRAY['lawn'],     'scissors',          110),
  ('weed_removal',             'Weed Removal',             4500,  ARRAY['lawn'],     'leaf',              120),
  ('leaf_debris_cleanup',      'Leaf & Debris Cleanup',    5500,  ARRAY['lawn'],     'wind',              130),
  ('fertilization_treatment',  'Fertilization Treatment',  7500,  ARRAY['lawn'],     'sprout',            140),
  ('driveway_pressure_wash',   'Driveway Pressure Wash',  15000,  ARRAY['lawn'],     'spray-can',         150),
  ('ozone_odor_treatment',     'Ozone Odor Treatment',     7500,  ARRAY['detail'],   'wind',              210),
  ('pet_hair_removal',         'Pet Hair Removal',         4500,  ARRAY['detail'],   'paw-print',         220),
  ('engine_bay_clean',         'Engine Bay Clean',         8500,  ARRAY['detail'],   'settings',          230),
  ('ceramic_spray_coat',       'Ceramic Spray Coat',       8500,  ARRAY['detail'],   'shield',            240);