DROP POLICY IF EXISTS "step_completions admin read" ON public.kpi_step_completions;
CREATE POLICY "step_completions read own or admin"
ON public.kpi_step_completions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));