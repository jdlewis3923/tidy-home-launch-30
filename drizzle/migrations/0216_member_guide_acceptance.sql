CREATE TABLE public.member_guide_acceptances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,version text NOT NULL,wording text NOT NULL,language text NOT NULL CHECK(language IN ('en','es')),accepted_at timestamptz NOT NULL DEFAULT now(),ip text,user_agent text);
GRANT SELECT ON public.member_guide_acceptances TO authenticated;
GRANT ALL ON public.member_guide_acceptances TO service_role;
ALTER TABLE public.member_guide_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY guide_acceptance_owner ON public.member_guide_acceptances FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.current_user_admin());
CREATE OR REPLACE FUNCTION public.member_guide_accepted(_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.member_guide_acceptances WHERE user_id=_user AND version='2026-10-27') $$;
REVOKE ALL ON FUNCTION public.member_guide_accepted(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_guide_accepted(uuid) TO service_role;