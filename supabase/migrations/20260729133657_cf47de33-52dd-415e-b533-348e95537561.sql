
-- notification_preferences: OR logic
DROP POLICY IF EXISTS "notif_prefs select own admin" ON public.notification_preferences;
DROP POLICY IF EXISTS "notif_prefs insert own admin" ON public.notification_preferences;
DROP POLICY IF EXISTS "notif_prefs update own admin" ON public.notification_preferences;

CREATE POLICY "notif_prefs select own or admin" ON public.notification_preferences
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "notif_prefs insert own or admin" ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "notif_prefs update own or admin" ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- push_subscriptions: OR logic
DROP POLICY IF EXISTS "push_subs select own admin" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subs insert own admin" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subs delete own admin" ON public.push_subscriptions;

CREATE POLICY "push_subs select own or admin" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "push_subs insert own or admin" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "push_subs delete own or admin" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- kpi_step_completions: allow any authenticated user to record/delete own completions
DROP POLICY IF EXISTS "step_completions admin insert" ON public.kpi_step_completions;
DROP POLICY IF EXISTS "step_completions admin delete" ON public.kpi_step_completions;

CREATE POLICY "step_completions insert own" ON public.kpi_step_completions
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "step_completions delete own or admin" ON public.kpi_step_completions
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
