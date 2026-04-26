-- =========================================================
-- Tidy: Phase 1 Foundation — observability + roles + RLS hardening
-- Idempotent: safe to re-run.
-- =========================================================

-- ---------- A. integration_logs ----------
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('stripe','jobber','resend','twilio','zapier','meta_capi','internal')),
  event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','error','warning')),
  latency_ms INTEGER,
  payload_hash TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_logs_source_created_idx
  ON public.integration_logs(source, created_at DESC);

CREATE INDEX IF NOT EXISTS integration_logs_status_created_idx
  ON public.integration_logs(status, created_at DESC);

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

-- ---------- B. role enum + user_roles + has_role ----------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('customer', 'crew', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON public.user_roles(user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

-- ---------- C. profiles: sms + language columns ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language CHAR(2) NOT NULL DEFAULT 'en';

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_language_check CHECK (language IN ('en','es'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- D. RLS policies ----------
-- integration_logs: admin SELECT only; service role bypasses RLS automatically.
DROP POLICY IF EXISTS "integration_logs admin select" ON public.integration_logs;
CREATE POLICY "integration_logs admin select"
  ON public.integration_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- user_roles: users can SEE their own roles; nobody (except service role) writes.
DROP POLICY IF EXISTS "user_roles select own" ON public.user_roles;
CREATE POLICY "user_roles select own"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admin SELECT-all overlay on profiles (own-row policies stay).
DROP POLICY IF EXISTS "profiles admin select all" ON public.profiles;
CREATE POLICY "profiles admin select all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- subscriptions: drop customer write policies; keep customer SELECT;
-- add admin SELECT-all. Service role bypasses RLS.
DROP POLICY IF EXISTS "subscriptions insert own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions update own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions delete own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions admin select all" ON public.subscriptions;
CREATE POLICY "subscriptions admin select all"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- invoices: same pattern.
DROP POLICY IF EXISTS "invoices insert own" ON public.invoices;
DROP POLICY IF EXISTS "invoices update own" ON public.invoices;
DROP POLICY IF EXISTS "invoices delete own" ON public.invoices;
DROP POLICY IF EXISTS "invoices admin select all" ON public.invoices;
CREATE POLICY "invoices admin select all"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- visits: same pattern.
DROP POLICY IF EXISTS "visits insert own" ON public.visits;
DROP POLICY IF EXISTS "visits update own" ON public.visits;
DROP POLICY IF EXISTS "visits delete own" ON public.visits;
DROP POLICY IF EXISTS "visits admin select all" ON public.visits;
CREATE POLICY "visits admin select all"
  ON public.visits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------- E. Seed admin role ----------
-- Grant admin role to jdlewis3923@gmail.com if account exists.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE u.email = 'jdlewis3923@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;