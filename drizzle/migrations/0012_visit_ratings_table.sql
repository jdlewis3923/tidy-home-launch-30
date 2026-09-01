CREATE TABLE public.visit_ratings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rating int not null check (rating between 1 and 5),
  comment text,
  visit_id uuid,
  pro_visit_id uuid,
  contractor_id uuid,
  user_id uuid,
  raw_identifier text,
  source text not null default 'sms_rate_link',
  lang text not null default 'en',
  google_prompted boolean not null default false,
  resolved_at timestamptz,
  resolution_notes text
);

CREATE INDEX visit_ratings_created_at_idx ON public.visit_ratings (created_at desc);
CREATE INDEX visit_ratings_pro_visit_idx ON public.visit_ratings (pro_visit_id);

GRANT SELECT ON public.visit_ratings TO authenticated;
GRANT ALL ON public.visit_ratings TO service_role;

ALTER TABLE public.visit_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage visit ratings"
ON public.visit_ratings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users read own visit ratings"
ON public.visit_ratings FOR SELECT TO authenticated
USING (user_id = auth.uid());