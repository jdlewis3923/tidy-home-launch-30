DROP INDEX IF EXISTS public.uq_slp_channel_postnum;
CREATE UNIQUE INDEX uq_slp_channel_postnum ON public.social_launch_posts (channel, post_number) WHERE archived_at IS NULL;