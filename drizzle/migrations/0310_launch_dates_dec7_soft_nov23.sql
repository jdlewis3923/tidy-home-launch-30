ALTER TABLE public.launch_config ADD COLUMN IF NOT EXISTS soft_start_date date;
GRANT SELECT (soft_start_date) ON public.launch_config TO anon, authenticated;
INSERT INTO public.launch_config_log (scope, field, old_value, new_value, changed_by)
SELECT scope, f, CASE f WHEN 'first_visit_date' THEN first_visit_date::text WHEN 'conversion_date' THEN conversion_date::text WHEN 'late_first_visit_week' THEN late_first_visit_week::text ELSE soft_start_date::text END,
 CASE f WHEN 'first_visit_date' THEN '2026-12-07' WHEN 'conversion_date' THEN '2026-11-30' WHEN 'late_first_visit_week' THEN '2026-12-14' ELSE '2026-11-23' END, '58b3d1cc-a4df-4e80-8826-9c1a2db6e5cc'
FROM public.launch_config, unnest(array['first_visit_date','conversion_date','late_first_visit_week','soft_start_date']) f WHERE scope IN ('cleaning','lawn');
UPDATE public.launch_config SET first_visit_date='2026-12-07', conversion_date='2026-11-30', late_first_visit_week='2026-12-14', soft_start_date='2026-11-23', updated_at=now(), updated_by='58b3d1cc-a4df-4e80-8826-9c1a2db6e5cc' WHERE scope IN ('cleaning','lawn');