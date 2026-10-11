ALTER TABLE public.service_scope ADD COLUMN IF NOT EXISTS group_en text;
ALTER TABLE public.service_scope ADD COLUMN IF NOT EXISTS group_es text;
ALTER TABLE public.service_scope ADD COLUMN IF NOT EXISTS notice_key text;
COMMENT ON COLUMN public.service_scope.notice_key IS 'For section=notice: which fixed placement shows it (monthly_growth, water, wash_interior_line).';