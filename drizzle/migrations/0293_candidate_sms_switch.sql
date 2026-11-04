INSERT INTO public.app_settings(key, value) VALUES ('candidate_sms_enabled', '"off"') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_candidate_phone(_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH d AS (SELECT right(regexp_replace(coalesce(_phone,''), '\D', '', 'g'), 10) AS p)
  SELECT length((SELECT p FROM d)) = 10 AND (
    EXISTS (SELECT 1 FROM public.applicants a, d WHERE right(regexp_replace(coalesce(a.phone,''), '\D', '', 'g'), 10) = d.p)
    OR EXISTS (SELECT 1 FROM public.profiles pr JOIN public.user_roles ur ON ur.user_id = pr.id AND ur.role = 'pro', d
               WHERE right(regexp_replace(coalesce(pr.phone,''), '\D', '', 'g'), 10) = d.p)
  );
$$;