ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS src text,
  ADD COLUMN IF NOT EXISTS founding boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gift_addons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_quote boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS update_count integer NOT NULL DEFAULT 0;

CREATE TABLE public.founding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL CHECK (char_length(session_id) BETWEEN 8 AND 64),
  event text NOT NULL CHECK (event IN ('page_view','step','tap_to_call','reserved','out_of_area','price_fallback')),
  step text CHECK (step IS NULL OR char_length(step) <= 40),
  src text CHECK (src IS NULL OR char_length(src) <= 60),
  zip text CHECK (zip IS NULL OR zip ~ '^\d{5}$'),
  lang text CHECK (lang IS NULL OR lang IN ('en','es')),
  reservation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX founding_events_created_idx ON public.founding_events (created_at DESC);
CREATE INDEX founding_events_session_idx ON public.founding_events (session_id);
GRANT INSERT ON public.founding_events TO anon, authenticated;
GRANT SELECT ON public.founding_events TO authenticated;
GRANT ALL ON public.founding_events TO service_role;
ALTER TABLE public.founding_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visitors log founding events" ON public.founding_events FOR INSERT TO anon, authenticated WITH CHECK (event <> 'reserved' AND reservation_id IS NULL);
CREATE POLICY "Admins read founding events" ON public.founding_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.page_visibility (
  path text PRIMARY KEY CHECK (path ~ '^/[a-z0-9\-]*$'),
  is_on boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_by_email text
);
GRANT SELECT, INSERT, UPDATE ON public.page_visibility TO authenticated;
GRANT ALL ON public.page_visibility TO service_role;
ALTER TABLE public.page_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage page visibility" ON public.page_visibility FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.page_visibility (path, is_on) VALUES
  ('/', false), ('/founding', true), ('/refer', false), ('/bundle', false), ('/house-cleaning', false),
  ('/lawn-care', false), ('/car-care', false), ('/apply', true), ('/terms', false), ('/privacy', false)
ON CONFLICT (path) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_page_visibility()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(path, is_on), '{}'::jsonb) FROM public.page_visibility
$$;
GRANT EXECUTE ON FUNCTION public.get_page_visibility() TO anon, authenticated;