-- The bundle gift is now ONE free premium add-on per month at 2+ services.
-- There is no car-wash gift: the only wash in the system is the $0.00
-- Maintenance Wash row inside Shine Complete, never billed separately.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS free_addons_per_month integer NOT NULL DEFAULT 0;

-- Backfill: any historical row that recorded a wash gift earns exactly one
-- free add-on instead. The legacy column stays in place but is no longer read.
UPDATE public.subscriptions
   SET free_addons_per_month = 1
 WHERE COALESCE(free_car_washes_per_month, 0) > 0;
