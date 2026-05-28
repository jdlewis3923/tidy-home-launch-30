
-- ============================================================
-- Security fixes: SECURITY DEFINER exec hardening, realtime
-- channel protection, and removing storage list privileges on
-- the public social-images bucket.
-- ============================================================

-- 1) SECURITY DEFINER function privileges -------------------------------------
-- Trigger-only / internal-only functions: revoke EXECUTE from anon + authenticated.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_welcome_signup()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_last_message()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_stage_entered_at()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_applicant_rates()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_scheduler_paused()              FROM PUBLIC, anon, authenticated;

-- Admin-only / service-role-only secret accessors used by edge functions.
REVOKE EXECUTE ON FUNCTION public.admin_set_meta_secret(text, text)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_meta_secret(text)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_service_role_key(text)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_service_role_key()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_jobber_refresh_token(text)         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_jobber_refresh_token()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_vapid_secret(text, text)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_vapid_public()                     FROM PUBLIC, anon, authenticated;

-- Client-callable admin RPCs (admin UI): keep authenticated; the function body
-- already gates with has_role(...).
-- has_role, is_site_live, current_user_admin, admin_set_site_live,
-- admin_set_scheduler_paused, admin_get_scheduler_paused remain executable.

-- 2) Realtime channel protection ---------------------------------------------
-- realtime.messages had no RLS, so any authenticated user could subscribe to
-- any topic. Lock it down: only admins may use Realtime broadcast/presence
-- channels. Postgres-changes subscriptions still pass through public-table
-- RLS (support_* tables are admin-only), so customer chatbot replies
-- continue to be blocked for non-admins as before.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can use realtime channels" ON realtime.messages;
CREATE POLICY "Admins can use realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can publish realtime messages" ON realtime.messages;
CREATE POLICY "Admins can publish realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Storage: prevent listing of the public social-images bucket -------------
-- Public buckets serve files via public URLs regardless of RLS, so dropping
-- the broad SELECT policy preserves direct file access while blocking
-- enumeration of bucket contents via the storage.objects API.
DROP POLICY IF EXISTS "social-images public read" ON storage.objects;
