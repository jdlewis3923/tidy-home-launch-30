-- Preferred Pro (preference only — never an assignment)

-- 1. Store the preference on the subscription.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS preferred_pro_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_preferred_pro_id
  ON public.subscriptions (preferred_pro_id) WHERE preferred_pro_id IS NOT NULL;

-- 2. Configurable thresholds + capacity assumptions in app_settings.
INSERT INTO public.app_settings (key, value)
VALUES (
  'preferred_pro',
  jsonb_build_object(
    'preferred_by_threshold', 15,
    'booked_pct_threshold', 0.85,
    'assumed_hours_per_visit', 2,
    'weekly_capacity_hours', 40
  )
)
ON CONFLICT (key) DO NOTHING;

-- Sections 3 and 4 (get_pro_capacity_stats, get_customer_preferred_pro_options)
-- were REMOVED from this legacy file on 2026-09-09.
--
-- Reason: drizzle/migrations is the single authoritative migration set for this
-- project. The definitions that used to live here had ZERO authorization and
-- re-granted get_pro_capacity_stats to `authenticated`, and pointed
-- get_customer_preferred_pro_options at the retired pro_visits table. Drizzle
-- 0035 and 0056 are the correct, guarded definitions. Leaving these here meant
-- a replay, a database reset or a fresh environment would silently revert both
-- fixes, because the two ledgers (drizzle.__drizzle_migrations and
-- supabase_migrations.schema_migrations) are independent and neither orders the
-- other. See docs/MIGRATIONS.md.
