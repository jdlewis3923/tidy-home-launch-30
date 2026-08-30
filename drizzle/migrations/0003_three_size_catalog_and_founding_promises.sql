-- Pricing rebuild: three sizes (1/2/3), Stripe referenced by lookup_key,
-- cadence carried by subscription quantity, bundle is a gift not a discount.
-- Additive only: the retired four-band columns are left in place, unused.

ALTER TABLE public.stripe_catalog DROP CONSTRAINT IF EXISTS stripe_catalog_shape_check;
UPDATE public.stripe_catalog SET band = NULL;

ALTER TABLE public.stripe_catalog
  ADD COLUMN IF NOT EXISTS lookup_key text,
  ADD COLUMN IF NOT EXISTS size smallint,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS quantity_rule text;

ALTER TABLE public.stripe_catalog ALTER COLUMN bundle_discount_pct SET DEFAULT 0;
UPDATE public.stripe_catalog SET bundle_discount_pct = 0;

ALTER TABLE public.stripe_catalog
  ADD CONSTRAINT stripe_catalog_size_check CHECK (size IS NULL OR size IN (1,2,3));
ALTER TABLE public.stripe_catalog
  ADD CONSTRAINT stripe_catalog_unit_check CHECK (unit IS NULL OR unit IN ('per_visit','per_month','one_time'));
ALTER TABLE public.stripe_catalog
  ADD CONSTRAINT stripe_catalog_quantity_rule_check CHECK (quantity_rule IS NULL OR quantity_rule IN ('cadence','always_1'));

-- Everything is inactive until re-seeded below (history still resolves).
UPDATE public.stripe_catalog SET active = false;

INSERT INTO public.stripe_catalog
  (stripe_price_id, lookup_key, service_type, size, addon_name, is_addon, per_visit, unit, quantity_rule, frequency, price_cents, description, active, sort_order)
VALUES
  ('price_1U9xoVD7AxvAjJGvKPd1k5Mf','clean_1','cleaning',1,NULL,false,true,'per_visit','cadence',NULL,13900,'House Cleaning — size 1 (condo / up to 2 bedrooms)',true,10),
  ('price_1U9xoaD7AxvAjJGvNOhWDbQw','clean_2','cleaning',2,NULL,false,true,'per_visit','cadence',NULL,18900,'House Cleaning — size 2 (house / 3 bedrooms)',true,11),
  ('price_1U9xofD7AxvAjJGvAsTeN275','clean_3','cleaning',3,NULL,false,true,'per_visit','cadence',NULL,27900,'House Cleaning — size 3 (large house / 4 bedrooms)',true,12),
  ('price_1U9xowD7AxvAjJGvPXwwKEuR','lawn_1','lawn',1,NULL,false,true,'per_visit','cadence',NULL,4500,'Lawn Care — size 1 (small yard)',true,20),
  ('price_1U9xozD7AxvAjJGv0u8Zyiyd','lawn_2','lawn',2,NULL,false,true,'per_visit','cadence',NULL,6500,'Lawn Care — size 2 (standard yard)',true,21),
  ('price_1U9xp4D7AxvAjJGvEYIaPmyK','lawn_3','lawn',3,NULL,false,true,'per_visit','cadence',NULL,9900,'Lawn Care — size 3 (large yard)',true,22),
  ('price_1U9xpID7AxvAjJGvzdOkTw5K','shine_1','detailing',1,NULL,false,false,'per_month','always_1',NULL,14900,'Shine Complete — size 1 (sedan / coupe)',true,30),
  ('price_1U9xpND7AxvAjJGvJFBelSYx','shine_2','detailing',2,NULL,false,false,'per_month','always_1',NULL,17900,'Shine Complete — size 2 (SUV / crossover)',true,31),
  ('price_1U9xpRD7AxvAjJGvpszp2wjm','shine_3','detailing',3,NULL,false,false,'per_month','always_1',NULL,23900,'Shine Complete — size 3 (truck / 3-row SUV / van)',true,32),
  ('price_1U9xppD7AxvAjJGvX2aVfyZX','wash_1_x1','detailing',1,'carWash1x1',true,false,'per_month','always_1',NULL,3900,'Car Wash Add-On — sedan, 1 wash a month',true,40),
  ('price_1U9xpuD7AxvAjJGvyvvmcrOD','wash_1_x2','detailing',1,'carWash1x2',true,false,'per_month','always_1',NULL,7500,'Car Wash Add-On — sedan, 2 washes a month',true,41),
  ('price_1U9xPfD7AxvAjJGvHfLC5q5u','wash_2_x1','detailing',2,'carWash2x1',true,false,'per_month','always_1',NULL,4900,'Car Wash Add-On — SUV, 1 wash a month',true,42),
  ('price_1U9xPmD7AxvAjJGvOE4WgiEN','wash_2_x2','detailing',2,'carWash2x2',true,false,'per_month','always_1',NULL,9500,'Car Wash Add-On — SUV, 2 washes a month',true,43),
  ('price_1U9xq0D7AxvAjJGvnLxZsNA9','wash_3_x1','detailing',3,'carWash3x1',true,false,'per_month','always_1',NULL,6500,'Car Wash Add-On — truck, 1 wash a month',true,44),
  ('price_1U9xqAD7AxvAjJGvUg74v5bC','wash_3_x2','detailing',3,'carWash3x2',true,false,'per_month','always_1',NULL,12900,'Car Wash Add-On — truck, 2 washes a month',true,45)
ON CONFLICT (stripe_price_id) DO UPDATE SET
  lookup_key = EXCLUDED.lookup_key,
  service_type = EXCLUDED.service_type,
  size = EXCLUDED.size,
  addon_name = EXCLUDED.addon_name,
  is_addon = EXCLUDED.is_addon,
  per_visit = EXCLUDED.per_visit,
  unit = EXCLUDED.unit,
  quantity_rule = EXCLUDED.quantity_rule,
  frequency = EXCLUDED.frequency,
  price_cents = EXCLUDED.price_cents,
  description = EXCLUDED.description,
  active = true,
  sort_order = EXCLUDED.sort_order;

UPDATE public.stripe_catalog SET active = true, unit = 'one_time', quantity_rule = 'always_1'
WHERE stripe_price_id IN (
  'price_1T1CMdD7AxvAjJGvb2RXCJUg','price_1TNCl4D7AxvAjJGvCEEWmMKA','price_1TNCjmD7AxvAjJGvtwYE31nw',
  'price_1TNCjnD7AxvAjJGvAKQN2y7a','price_1TNCjpD7AxvAjJGvoZQSrVrh','price_1TNCl5D7AxvAjJGvPbjrVube',
  'price_1T1CpMD7AxvAjJGvWqNVcrSi','price_1TNCl7D7AxvAjJGv3YxUwsUg','price_1TNCl9D7AxvAjJGvf7PJ200g',
  'price_1TNCjqD7AxvAjJGvmWIM5yUB','price_1TNCjrD7AxvAjJGv3cHMAlq6','price_1TNCjsD7AxvAjJGviCx7ZE0B',
  'price_1TNCl6D7AxvAjJGvxirYq3hZ','price_1TNCjuD7AxvAjJGvKKqR021j','price_1TNCjvD7AxvAjJGvQXVMBvpa'
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_catalog_lookup_key_uniq
  ON public.stripe_catalog (lookup_key) WHERE lookup_key IS NOT NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS size smallint,
  ADD COLUMN IF NOT EXISTS sizes_json jsonb,
  ADD COLUMN IF NOT EXISTS founding_rate_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_free_addon_first_visit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_free_addon_fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS founding_review_promised boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_car_washes_per_month smallint NOT NULL DEFAULT 0;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_size_check CHECK (size IS NULL OR size IN (1,2,3));