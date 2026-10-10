ALTER TABLE public.support_conversations ADD COLUMN IF NOT EXISTS pro_user_id uuid;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS visit_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS support_conv_one_per_pro ON public.support_conversations(pro_user_id) WHERE pro_user_id IS NOT NULL;

CREATE POLICY "support_conv pro read own" ON public.support_conversations FOR SELECT TO authenticated USING (pro_user_id = auth.uid());
CREATE POLICY "support_msg pro read own" ON public.support_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_conversations c WHERE c.id = conversation_id AND c.pro_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.pro_send_message(_body text, _visit_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _conv uuid; _msg uuid; _name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (public.has_role(_uid,'pro') OR public.has_role(_uid,'crew') OR EXISTS (SELECT 1 FROM visits WHERE assigned_pro_id=_uid)) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  _body := btrim(coalesce(_body,''));
  IF length(_body) = 0 OR length(_body) > 2000 THEN RAISE EXCEPTION 'invalid_body'; END IF;
  IF _visit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM visits WHERE id=_visit_id AND assigned_pro_id=_uid) THEN _visit_id := NULL; END IF;
  SELECT id INTO _conv FROM support_conversations WHERE pro_user_id=_uid;
  IF _conv IS NULL THEN
    SELECT coalesce(raw_user_meta_data->>'full_name', email) INTO _name FROM auth.users WHERE id=_uid;
    INSERT INTO support_conversations(channel, pro_user_id, customer_name, status)
      VALUES ('pro', _uid, 'Pro: '||coalesce(_name,'unknown'), 'escalated') RETURNING id INTO _conv;
  ELSE
    UPDATE support_conversations SET status='escalated' WHERE id=_conv;
  END IF;
  INSERT INTO support_messages(conversation_id, direction, sender_type, sender_user_id, body, visit_id)
    VALUES (_conv, 'inbound', 'pro', _uid, _body, _visit_id) RETURNING id INTO _msg;
  INSERT INTO admin_alerts(alert_type, title, body, level, category, action_label, action_url, dedupe_key)
    VALUES ('pro_message', 'New message from a Pro', left(_body,280), 'action', 'support', 'Open inbox', '/admin/inbox?c='||_conv, 'pro_msg_'||_msg);
  RETURN _conv;
END $$;
REVOKE ALL ON FUNCTION public.pro_send_message(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pro_send_message(text, uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_photos;