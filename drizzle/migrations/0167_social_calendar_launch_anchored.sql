ALTER TABLE public.social_launch_posts
  ADD COLUMN IF NOT EXISTS template_copy text,
  ADD COLUMN IF NOT EXISTS anchor_type text CHECK (anchor_type IN ('FIXED','LAUNCH','CAR_LAUNCH','CONVERSION','HANGER_DROP_1')),
  ADD COLUMN IF NOT EXISTS anchor_value text,
  ADD COLUMN IF NOT EXISTS priority smallint,
  ADD COLUMN IF NOT EXISTS not_before text NOT NULL DEFAULT 'none' CHECK (not_before IN ('none','LAUNCH','CAR_LAUNCH')),
  ADD COLUMN IF NOT EXISTS drop_if_bumped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_spare boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiting_reason text,
  ADD COLUMN IF NOT EXISTS image_subject text,
  ADD COLUMN IF NOT EXISTS image_flag text,
  ADD COLUMN IF NOT EXISTS rendered_caption text;
ALTER TABLE public.social_launch_posts ALTER COLUMN scheduled_for DROP NOT NULL;

-- Re-plan when launch dates change.
CREATE OR REPLACE FUNCTION public.social_replan_on_launch_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.call_edge_function('social-plan', '{"reason":"launch_config"}'::jsonb);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_social_replan ON public.launch_config;
CREATE TRIGGER trg_social_replan AFTER UPDATE OF first_visit_date, conversion_date, hanger_drops ON public.launch_config
  FOR EACH STATEMENT EXECUTE FUNCTION public.social_replan_on_launch_change();

SELECT cron.schedule('social-plan-nightly', '15 7 * * *', $job$SELECT public.cron_http_post('social-plan-nightly', 'social-plan', '{"reason":"nightly"}'::jsonb);$job$);