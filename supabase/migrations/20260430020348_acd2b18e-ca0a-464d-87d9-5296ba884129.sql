-- 1. Add compliance flag (used to gate activation).
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS compliance_complete boolean NOT NULL DEFAULT false;

-- 2. Move any existing demo_passed → oriented (free-text column, no enum).
UPDATE public.applicants
   SET current_stage = 'oriented',
       stage_entered_at = COALESCE(stage_entered_at, now()),
       updated_at = now()
 WHERE current_stage = 'demo_passed';

-- 3. Orientations.
CREATE TABLE IF NOT EXISTS public.orientations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_at timestamptz NOT NULL,
  location text,
  capacity int NOT NULL DEFAULT 8,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orientations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orientations admin select"
  ON public.orientations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "orientations admin insert"
  ON public.orientations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "orientations admin update"
  ON public.orientations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "orientations admin delete"
  ON public.orientations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_orientations_updated_at
  BEFORE UPDATE ON public.orientations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_orientations_scheduled_at
  ON public.orientations (scheduled_at DESC);

-- 4. Attendees.
CREATE TABLE IF NOT EXISTS public.orientation_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orientation_id uuid NOT NULL REFERENCES public.orientations(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  attended boolean NOT NULL DEFAULT false,
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (orientation_id, applicant_id)
);

ALTER TABLE public.orientation_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orientation_attendees admin select"
  ON public.orientation_attendees FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "orientation_attendees admin insert"
  ON public.orientation_attendees FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "orientation_attendees admin update"
  ON public.orientation_attendees FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "orientation_attendees admin delete"
  ON public.orientation_attendees FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_orient_attendees_orientation
  ON public.orientation_attendees (orientation_id);
CREATE INDEX IF NOT EXISTS idx_orient_attendees_applicant
  ON public.orientation_attendees (applicant_id);
