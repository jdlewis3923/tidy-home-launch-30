CREATE OR REPLACE FUNCTION public.admin_evidence_pack(_email text, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid; out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  SELECT jsonb_build_object(
    'email', lower(trim(_email)), 'user_id', uid, 'from', _from, 'to', _to, 'built_at', now(),
    'profile', (SELECT jsonb_build_object('name', concat_ws(' ', first_name, last_name), 'zip', zip) FROM profiles WHERE user_id = uid),
    'acceptances', coalesce((SELECT jsonb_agg(jsonb_build_object('service', service, 'version', scope_version, 'accepted_at', accepted_at, 'ip', ip, 'user_agent', user_agent, 'language', language, 'surface', surface, 'water_consent', water_consent, 'checkbox_text', checkbox_text) ORDER BY accepted_at)
        FROM scope_acceptances WHERE customer_id = uid OR lower(email) = lower(trim(_email))), '[]'),
    'plans', coalesce((SELECT jsonb_agg(jsonb_build_object('services', services, 'cadence', coalesce(cadence, frequency::text), 'monthly_total_cents', monthly_total_cents, 'status', status, 'created_at', created_at, 'stripe_subscription_id', stripe_subscription_id)) FROM subscriptions WHERE user_id = uid), '[]'),
    'visits', coalesce((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'service', v.service_type, 'kind', v.visit_kind, 'scheduled', v.scheduled_start, 'status', v.status, 'check_in_at', v.check_in_at, 'check_in_lat', v.check_in_lat, 'check_in_lng', v.check_in_lng, 'check_out_at', v.check_out_at, 'check_out_lat', v.check_out_lat, 'check_out_lng', v.check_out_lng, 'completed_at', v.completed_at,
          'photos', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', p.kind, 'path', p.storage_path, 'at', p.uploaded_at) ORDER BY p.kind, p.uploaded_at) FROM visit_photos p WHERE p.visit_id = v.id), '[]')) ORDER BY v.scheduled_start)
        FROM visits v WHERE v.user_id = uid AND v.scheduled_start::date BETWEEN _from AND _to), '[]'),
    'redos', coalesce((SELECT jsonb_agg(jsonb_build_object('visit_id', visit_id, 'requested_at', requested_at, 'status', status, 'note', note, 'missed_items', missed_items, 'resolved_at', resolved_at) ORDER BY requested_at) FROM redo_requests WHERE user_id = uid), '[]'),
    'damage_claims', coalesce((SELECT jsonb_agg(jsonb_build_object('visit_id', visit_id, 'reported_at', reported_at, 'status', status, 'description', description) ORDER BY reported_at) FROM damage_claims WHERE user_id = uid), '[]'),
    'emails_texts', coalesce((SELECT jsonb_agg(jsonb_build_object('at', triggered_at, 'channel', channel, 'template', template_name, 'status', status) ORDER BY triggered_at) FROM email_send_log WHERE lower(recipient) = lower(trim(_email))), '[]'),
    'sms', coalesce((SELECT jsonb_agg(jsonb_build_object('at', sent_at, 'type', sms_type, 'suppressed', suppressed) ORDER BY sent_at) FROM sms_log WHERE user_id = uid), '[]'),
    'notifications', coalesce((SELECT jsonb_agg(jsonb_build_object('at', created_at, 'title', title, 'body', body) ORDER BY created_at) FROM member_notifications WHERE user_id = uid), '[]'),
    'messages', coalesce((SELECT jsonb_agg(jsonb_build_object('at', m.created_at, 'direction', m.direction, 'sender', m.sender_type, 'body', m.body) ORDER BY m.created_at) FROM support_messages m JOIN support_conversations c ON c.id = m.conversation_id WHERE lower(c.customer_email) = lower(trim(_email))), '[]')
  ) INTO out;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.admin_evidence_pack(text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_evidence_pack(text, date, date) TO authenticated;