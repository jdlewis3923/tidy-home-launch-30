CREATE TABLE public.pro_orientation_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  section_id text NOT NULL CHECK (section_id IN ('before-you-work','what-it-pays','on-the-job','when-it-matters')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(applicant_id, section_id)
);
GRANT SELECT, INSERT, UPDATE ON public.pro_orientation_progress TO authenticated;
GRANT ALL ON public.pro_orientation_progress TO service_role;
ALTER TABLE public.pro_orientation_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pros read own orientation progress" ON public.pro_orientation_progress FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.applicants a WHERE a.id = applicant_id AND a.contractor_id = auth.uid()));
CREATE POLICY "Pros add own orientation progress" ON public.pro_orientation_progress FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.applicants a WHERE a.id = applicant_id AND a.contractor_id = auth.uid()));
CREATE POLICY "Pros update own orientation progress" ON public.pro_orientation_progress FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.applicants a WHERE a.id = applicant_id AND a.contractor_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.applicants a WHERE a.id = applicant_id AND a.contractor_id = auth.uid()));
CREATE POLICY "Admins read orientation progress" ON public.pro_orientation_progress FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.pro_orientation_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid; st text; rows jsonb;
BEGIN
 SELECT a.id, coalesce(p.stage,'applied') INTO aid, st FROM public.applicants a LEFT JOIN public.contractor_pipeline p ON p.applicant_id=a.id WHERE a.contractor_id=auth.uid() LIMIT 1;
 IF aid IS NULL THEN RAISE EXCEPTION 'pro not found' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('section_id',section_id,'started_at',started_at,'completed_at',completed_at)),'[]'::jsonb) INTO rows FROM public.pro_orientation_progress WHERE applicant_id=aid;
 RETURN jsonb_build_object('applicant_id',aid,'stage',st,'progress',rows);
END $$;
REVOKE ALL ON FUNCTION public.pro_orientation_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_orientation_state() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pro_orientation_touch(_section_id text, _complete boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid; st text; need integer; have integer;
BEGIN
 IF _section_id NOT IN ('before-you-work','what-it-pays','on-the-job','when-it-matters') THEN RAISE EXCEPTION 'unknown section'; END IF;
 SELECT a.id, coalesce(p.stage,'applied') INTO aid, st FROM public.applicants a LEFT JOIN public.contractor_pipeline p ON p.applicant_id=a.id WHERE a.contractor_id=auth.uid() LIMIT 1;
 IF aid IS NULL THEN RAISE EXCEPTION 'pro not found' USING ERRCODE='42501'; END IF;
 need := CASE _section_id WHEN 'before-you-work' THEN 3 WHEN 'what-it-pays' THEN 5 WHEN 'on-the-job' THEN 5 ELSE 6 END;
 have := public.pipeline_stage_index(st);
 IF have < need THEN RAISE EXCEPTION 'section locked' USING ERRCODE='42501'; END IF;
 INSERT INTO public.pro_orientation_progress(applicant_id,section_id,completed_at) VALUES(aid,_section_id,CASE WHEN _complete THEN now() ELSE NULL END)
 ON CONFLICT(applicant_id,section_id) DO UPDATE SET completed_at=CASE WHEN _complete THEN coalesce(pro_orientation_progress.completed_at,now()) ELSE pro_orientation_progress.completed_at END;
END $$;
REVOKE ALL ON FUNCTION public.pro_orientation_touch(text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_orientation_touch(text,boolean) TO authenticated, service_role;