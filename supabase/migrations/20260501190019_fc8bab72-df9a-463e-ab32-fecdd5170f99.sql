
-- ============================================================================
-- 1) addon_attach_tokens: RLS enabled but no policies (lint 0008)
--    Service role bypasses RLS so edge functions still work. Add an admin-only
--    SELECT policy so the table has at least one explicit rule.
-- ============================================================================
CREATE POLICY "addon_attach_tokens admin select"
  ON public.addon_attach_tokens
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================================
-- 2) Replace WITH CHECK (true) public-insert policies with constrained
--    versions (lint 0024). Anon submissions are still allowed but must
--    include a non-empty, reasonably bounded email.
-- ============================================================================

-- applicants
DROP POLICY IF EXISTS "applicants insert public" ON public.applicants;
CREATE POLICY "applicants insert public"
  ON public.applicants
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND length(btrim(email)) BETWEEN 5 AND 255
    AND email LIKE '%_@_%.__%'
    AND first_name IS NOT NULL AND length(btrim(first_name)) BETWEEN 1 AND 100
    AND last_name  IS NOT NULL AND length(btrim(last_name))  BETWEEN 1 AND 100
  );

-- chatbot_leads
DROP POLICY IF EXISTS "Anyone can submit callback" ON public.chatbot_leads;
CREATE POLICY "Anyone can submit callback"
  ON public.chatbot_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    phone IS NOT NULL
    AND length(btrim(phone)) BETWEEN 7 AND 32
    AND (name      IS NULL OR length(name)      <= 200)
    AND (question  IS NULL OR length(question)  <= 2000)
  );

-- waitlist (only constrain if it actually exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='waitlist' AND policyname='waitlist insert anyone'
  ) THEN
    EXECUTE 'DROP POLICY "waitlist insert anyone" ON public.waitlist';
    EXECUTE $POL$
      CREATE POLICY "waitlist insert anyone"
        ON public.waitlist
        FOR INSERT
        TO anon, authenticated
        WITH CHECK (
          email IS NOT NULL
          AND length(btrim(email)) BETWEEN 5 AND 255
          AND email LIKE '%_@_%.__%'
        )
    $POL$;
  END IF;
END $$;

-- ============================================================================
-- 3) Lock down SECURITY DEFINER functions that should never be callable
--    by anon (lint 0028). These two are admin-only mutations that previously
--    had EXECUTE granted to public/anon by accident.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.admin_set_site_live(boolean)            FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_vapid_secret(text, text)      FROM anon, public;
-- Re-grant to the intended caller (signed-in admin; the function body
-- itself enforces has_role(auth.uid(),'admin')).
GRANT EXECUTE ON FUNCTION public.admin_set_site_live(boolean)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_vapid_secret(text, text)  TO authenticated;
