CREATE TABLE public.pro_pay_profiles (
  connecteam_user_id bigint PRIMARY KEY,
  name text NOT NULL,
  email text,
  language text NOT NULL DEFAULT 'en',
  started_on date NOT NULL DEFAULT current_date,
  coi_verified_at timestamptz,
  tier2_since timestamptz,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pro_pay_profiles TO authenticated;
GRANT ALL ON public.pro_pay_profiles TO service_role;
ALTER TABLE public.pro_pay_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage pay profiles" ON public.pro_pay_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.pro_pay_profiles(connecteam_user_id, name, email) VALUES
  (31157941, 'Susan Horn', 'susanhorn4life@gmail.com'),
  (31157945, 'Jenifer Whitney', 'jeniferwhitney017@gmail.com');

CREATE TABLE public.pro_pay_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_key text NOT NULL UNIQUE,
  connecteam_user_id bigint NOT NULL,
  week_start date NOT NULL,
  payout_friday date NOT NULL,
  kind text NOT NULL,
  description text NOT NULL,
  jobber_visit_id text,
  member_user_id uuid,
  base_cents integer NOT NULL DEFAULT 0,
  pay_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'owed',
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.pro_pay_lines TO authenticated;
GRANT ALL ON public.pro_pay_lines TO service_role;
ALTER TABLE public.pro_pay_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pay lines" ON public.pro_pay_lines FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update pay lines" ON public.pro_pay_lines FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX pro_pay_lines_week_idx ON public.pro_pay_lines(week_start, connecteam_user_id);
COMMENT ON TABLE public.pro_payout_lines IS 'DEPRECATED: replaced by pro_pay_lines';

ALTER TABLE public.jobber_visits
  ADD COLUMN pay_outcome text,
  ADD COLUMN team_user_ids bigint[],
  ADD COLUMN rating smallint;

ALTER TABLE public.google_reviews
  ADD COLUMN match_status text,
  ADD COLUMN matched_ct_user_id bigint,
  ADD COLUMN member_user_id uuid,
  ADD COLUMN match_note text,
  ADD COLUMN decided_at timestamptz;