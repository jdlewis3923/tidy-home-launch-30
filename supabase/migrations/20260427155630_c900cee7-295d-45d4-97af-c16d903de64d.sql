
-- 1. Extend enum
ALTER TYPE social_post_status ADD VALUE IF NOT EXISTS 'paused';

-- 2. Settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings admin read"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "app_settings admin write"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed paused = true (kill switch ON by default per Justin's instruction)
INSERT INTO public.app_settings (key, value)
VALUES ('scheduler_paused', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Helpers
CREATE OR REPLACE FUNCTION public.is_scheduler_paused()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT (value)::boolean FROM public.app_settings WHERE key = 'scheduler_paused'), true);
$$;

CREATE OR REPLACE FUNCTION public.admin_set_scheduler_paused(_paused BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('scheduler_paused', to_jsonb(_paused), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  RETURN _paused;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_scheduler_paused()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN public.is_scheduler_paused();
END;
$$;
