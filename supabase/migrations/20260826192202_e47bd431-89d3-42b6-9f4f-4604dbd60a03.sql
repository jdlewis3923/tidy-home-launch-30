-- 1. has_role must be executable by signed-in users (every RLS policy calls it)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_live() TO authenticated, anon;

-- 2. Bundle discount rates — single source of truth read by stripe-create-checkout
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('bundle_discount_pct', '{"2": 10, "3": 15}'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 3. Lock down chatbot_knowledge (internal bot instructions)
DROP POLICY IF EXISTS "Knowledge readable by all" ON public.chatbot_knowledge;
CREATE POLICY "Admins can read knowledge"
  ON public.chatbot_knowledge FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON public.chatbot_knowledge FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.chatbot_knowledge TO authenticated;
GRANT ALL ON public.chatbot_knowledge TO service_role;

-- 4. Guarantee window is 24 hours everywhere
UPDATE public.chatbot_knowledge
SET content = replace(content, 'within 48 hours', 'within 24 hours'),
    updated_at = now()
WHERE content LIKE '%within 48 hours%';