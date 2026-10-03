-- One household counts once toward its ZIP's 25, whatever services it reserves.
CREATE OR REPLACE FUNCTION public.founding_address_key(_street text, _zip text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT left(trim(coalesce(_zip,'')),5) || ':' || regexp_replace(
    regexp_replace(lower(coalesce(_street,'')), '\m(street)\M', 'st', 'g') ||'',
    '[^a-z0-9]', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.founding_home_counts()
RETURNS TABLE(zip text, homes integer, cap integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT z.zip, COALESCE((
    SELECT count(DISTINCT public.founding_address_key(r.street, r.zip))::int
    FROM public.reservations r
    WHERE r.status <> 'canceled' AND left(r.zip,5) = z.zip
      AND coalesce(cardinality(r.waitlist_services),0) = 0
  ), 0), 25
  FROM unnest(ARRAY['33156','33183','33186']) AS z(zip)
$$;
REVOKE ALL ON FUNCTION public.founding_home_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founding_home_counts() TO anon, authenticated, service_role;

-- Server-side: is this address already a founding home, and how many homes the ZIP holds.
CREATE OR REPLACE FUNCTION public.founding_home_status(_street text, _zip text)
RETURNS TABLE(homes integer, already boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(DISTINCT public.founding_address_key(r.street, r.zip))::int FROM public.reservations r
      WHERE r.status <> 'canceled' AND left(r.zip,5) = left(_zip,5) AND coalesce(cardinality(r.waitlist_services),0) = 0),
    EXISTS (SELECT 1 FROM public.reservations r
      WHERE r.status <> 'canceled' AND coalesce(cardinality(r.waitlist_services),0) = 0
        AND public.founding_address_key(r.street, r.zip) = public.founding_address_key(_street, _zip))
$$;
REVOKE ALL ON FUNCTION public.founding_home_status(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.founding_home_status(text, text) TO service_role;

-- Inbox → redo: link a support message to the member and the visit it refers to.
ALTER TABLE public.redo_requests ADD COLUMN IF NOT EXISTS support_message_id uuid;
ALTER TABLE public.redo_requests DROP CONSTRAINT IF EXISTS redo_requests_source_chk;
ALTER TABLE public.redo_requests ADD CONSTRAINT redo_requests_source_chk CHECK (source IN ('dashboard','email','sms','admin','inbox'));

CREATE OR REPLACE FUNCTION public.inbox_message_visit(_message_id uuid)
RETURNS TABLE(message_id uuid, conversation_id uuid, sent_at timestamptz, body text, user_id uuid, visit_id uuid, completed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (
    SELECT sm.id, sm.conversation_id, sm.created_at, sm.body, c.customer_phone_e164, lower(c.customer_email) AS email
    FROM public.support_messages sm JOIN public.support_conversations c ON c.id = sm.conversation_id
    WHERE sm.id = _message_id AND sm.direction = 'inbound'
  ), u AS (
    SELECT p.id AS uid FROM public.profiles p, m
     WHERE m.customer_phone_e164 IS NOT NULL
       AND right(regexp_replace(coalesce(p.phone,''),'\D','','g'),10) = right(regexp_replace(m.customer_phone_e164,'\D','','g'),10)
       AND length(regexp_replace(coalesce(p.phone,''),'\D','','g')) >= 10
    UNION
    SELECT au.id FROM auth.users au, m WHERE m.email IS NOT NULL AND lower(au.email) = m.email
  )
  SELECT m.id, m.conversation_id, m.created_at, m.body, v.user_id, v.id, v.completed_at
  FROM m LEFT JOIN LATERAL (
    SELECT vv.id, vv.user_id, vv.completed_at FROM public.visits vv
    WHERE vv.user_id IN (SELECT uid FROM u) AND vv.completed_at IS NOT NULL AND coalesce(vv.is_redo,false) = false
      AND vv.completed_at <= m.created_at
    ORDER BY vv.completed_at DESC LIMIT 1
  ) v ON true
  WHERE public.has_role(auth.uid(), 'admin') OR public.is_service_caller()
$$;
REVOKE ALL ON FUNCTION public.inbox_message_visit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_message_visit(uuid) TO authenticated, service_role;

-- Threads with an inbound member message inside 48h of a completed visit.
CREATE OR REPLACE FUNCTION public.inbox_redo_flags()
RETURNS TABLE(conversation_id uuid, message_id uuid, visit_id uuid, sent_at timestamptz, redo_exists boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.conversation_id, x.message_id, x.visit_id, x.sent_at,
         EXISTS (SELECT 1 FROM public.redo_requests rr WHERE rr.visit_id = x.visit_id AND rr.status <> 'canceled')
  FROM public.support_messages sm
  CROSS JOIN LATERAL public.inbox_message_visit(sm.id) x
  WHERE public.has_role(auth.uid(), 'admin')
    AND sm.direction = 'inbound' AND sm.created_at > now() - interval '14 days'
    AND x.visit_id IS NOT NULL AND x.sent_at - x.completed_at <= interval '48 hours'
$$;
REVOKE ALL ON FUNCTION public.inbox_redo_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_redo_flags() TO authenticated;

-- Name the person behind a phone number for failed-text alerts.
CREATE OR REPLACE FUNCTION public.sms_recipient_name(_phone text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT right(regexp_replace(coalesce(_phone,''),'\D','','g'),10) AS k)
  SELECT coalesce(
    (SELECT 'Member ' || trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) FROM public.profiles p, d
      WHERE length(d.k)=10 AND right(regexp_replace(coalesce(p.phone,''),'\D','','g'),10) = d.k LIMIT 1),
    (SELECT 'Pro ' || trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')) FROM public.applicants a, d
      WHERE length(d.k)=10 AND right(regexp_replace(coalesce(a.phone,''),'\D','','g'),10) = d.k LIMIT 1),
    (SELECT 'Reservation ' || trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')) FROM public.reservations r, d
      WHERE length(d.k)=10 AND right(regexp_replace(coalesce(r.phone,''),'\D','','g'),10) = d.k ORDER BY r.created_at DESC LIMIT 1))
$$;
REVOKE ALL ON FUNCTION public.sms_recipient_name(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_recipient_name(text) TO service_role;