CREATE OR REPLACE FUNCTION public.admin_set_launch_config(_scope text, _field text, _value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old text; n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _field IS NULL OR _field NOT IN ('first_visit_date','conversion_date','pro_callback_date','pro_ready_by','late_first_visit_week','hanger_drops','est_full_day_pay') THEN
    RAISE EXCEPTION 'unknown_field';
  END IF;
  SELECT CASE _field
    WHEN 'first_visit_date' THEN first_visit_date::text
    WHEN 'conversion_date' THEN conversion_date::text
    WHEN 'pro_callback_date' THEN pro_callback_date::text
    WHEN 'pro_ready_by' THEN pro_ready_by::text
    WHEN 'late_first_visit_week' THEN late_first_visit_week::text
    WHEN 'hanger_drops' THEN hanger_drops::text
    WHEN 'est_full_day_pay' THEN est_full_day_pay::text
  END INTO old FROM public.launch_config WHERE scope = _scope FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_scope'; END IF;
  CASE _field
    WHEN 'first_visit_date' THEN
      UPDATE public.launch_config SET first_visit_date = nullif(_value, '')::date, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
    WHEN 'conversion_date' THEN
      UPDATE public.launch_config SET conversion_date = nullif(_value, '')::date, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
    WHEN 'pro_callback_date' THEN
      UPDATE public.launch_config SET pro_callback_date = nullif(_value, '')::date, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
    WHEN 'pro_ready_by' THEN
      UPDATE public.launch_config SET pro_ready_by = nullif(_value, '')::date, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
    WHEN 'late_first_visit_week' THEN
      UPDATE public.launch_config SET late_first_visit_week = nullif(_value, '')::date, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
    WHEN 'hanger_drops' THEN
      UPDATE public.launch_config SET hanger_drops = _value::jsonb, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
    WHEN 'est_full_day_pay' THEN
      UPDATE public.launch_config SET est_full_day_pay = nullif(_value, '')::numeric, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
  END CASE;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'unknown_scope'; END IF;
  INSERT INTO public.launch_config_log (scope, field, old_value, new_value, changed_by) VALUES (_scope, _field, old, _value, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.admin_set_launch_config(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_launch_config(text,text,text) TO authenticated;