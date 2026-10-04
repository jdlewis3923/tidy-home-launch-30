CREATE TABLE public.google_listing_cache (
  id text PRIMARY KEY DEFAULT 'tidy',
  rating numeric,
  total_count integer,
  maps_uri text,
  reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_error_at timestamptz
);
GRANT ALL ON public.google_listing_cache TO service_role;
GRANT SELECT ON public.google_listing_cache TO authenticated;
ALTER TABLE public.google_listing_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read listing cache" ON public.google_listing_cache FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

-- Admin-known neighborhood for a Google reviewer (Google does not provide it).
CREATE TABLE public.google_reviewer_neighborhoods (
  author_name text PRIMARY KEY,
  neighborhood text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_reviewer_neighborhoods TO authenticated;
GRANT ALL ON public.google_reviewer_neighborhoods TO service_role;
ALTER TABLE public.google_reviewer_neighborhoods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage reviewer neighborhoods" ON public.google_reviewer_neighborhoods FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));