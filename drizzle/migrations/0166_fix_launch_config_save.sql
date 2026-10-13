CREATE OR REPLACE FUNCTION public.admin_set_launch_config(_scope text, _field text, _value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old text; n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _field NOT IN ('first_visit_date','conversion_date','pro_callback_date','pro_ready_by','late_first_visit_week','hanger_drops') THEN
    RAISE EXCEPTION 'unknown_field';
  END IF;
  EXECUTE format('SELECT (%I)::text FROM public.launch_config WHERE scope = $1', _field) INTO old USING _scope;
  IF _field = 'hanger_drops' THEN
    UPDATE public.launch_config SET hanger_drops = _value::jsonb, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
  ELSE
    EXECUTE format('UPDATE public.launch_config SET %I = $1::date, updated_at = now(), updated_by = $2 WHERE scope = $3', _field)
      USING nullif(_value, ''), auth.uid(), _scope;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'unknown_scope'; END IF;
  INSERT INTO public.launch_config_log (scope, field, old_value, new_value, changed_by) VALUES (_scope, _field, old, _value, auth.uid());
END $$;