ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS address text;

CREATE OR REPLACE FUNCTION public.founding_spots_left(_zip text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(0, 25 - count(*))::integer
  FROM public.subscriptions s
  WHERE s.founding_zip = left(trim(_zip), 5)
    AND s.status = 'active'
    AND s.founding_rate_locked IS TRUE
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.subscription_id = s.id
        AND i.status = 'paid'
        AND i.paid_at IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION public.founding_spots_left(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founding_spots_left(text) TO anon, authenticated, service_role;