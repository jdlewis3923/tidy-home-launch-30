CREATE TABLE public.google_listing_manual (
  id text PRIMARY KEY DEFAULT 'tidy',
  rating numeric NOT NULL CHECK (rating BETWEEN 1 AND 5),
  total_count integer NOT NULL CHECK (total_count >= 0),
  listing_url text NOT NULL,
  verified_at date NOT NULL DEFAULT current_date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_listing_manual TO authenticated;
GRANT ALL ON public.google_listing_manual TO service_role;
ALTER TABLE public.google_listing_manual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage listing manual" ON public.google_listing_manual FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.site_google_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name text NOT NULL,
  author_photo_url text,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_date date NOT NULL,
  review_text text NOT NULL CHECK (length(trim(review_text)) > 0),
  neighborhood text,
  service text CHECK (service IN ('cleaning','lawn','car_care')),
  review_url text,
  verified_at date NOT NULL DEFAULT current_date,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_google_reviews TO authenticated;
GRANT ALL ON public.site_google_reviews TO service_role;
ALTER TABLE public.site_google_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage site reviews" ON public.site_google_reviews FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));