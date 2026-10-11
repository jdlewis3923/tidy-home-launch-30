-- 1. Visit hours come from Stripe price metadata (synced by sync-budget-hours).
ALTER TABLE public.sched_budget_hours ADD COLUMN IF NOT EXISTS source_lookup_key text, ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- Deep clean is always 1.5x that size's standard cleaning hours; never its own row.
CREATE OR REPLACE FUNCTION public.sched_budget(_s public.service_type, _size smallint, _kind text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _kind = 'quarterly_deep_clean' THEN 1.5 * public.sched_budget(_s, _size, 'standard') ELSE coalesce(
    (SELECT hours FROM public.sched_budget_hours WHERE service = _s AND visit_kind = coalesce(_kind, public.sched_std_kind(_s))
       AND size_tier IN (coalesce(_size, 0), 0) ORDER BY size_tier DESC LIMIT 1),
    CASE _s::text WHEN 'cleaning' THEN 3 WHEN 'lawn' THEN 0.9 ELSE 1 END) END
$$;

-- 2. Weekly cleaning: every 13th visit IS the deep clean, on the customer's own day and window.
CREATE OR REPLACE FUNCTION public.sched_generate_booking(_b uuid, _until date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.customer_bookings; sub public.subscriptions; ln jsonb; sz smallint; cad text; surch boolean; kind text; pay int; xpay int;
        d date; idx int := 0; made int := 0; stop date; today date := public.sched_today(); k int; ms date;
BEGIN
  SELECT * INTO b FROM public.customer_bookings WHERE id = _b AND status = 'active';
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO sub FROM public.subscriptions WHERE id = b.subscription_id;
  IF sub.status::text <> 'active' THEN RETURN 0; END IF;
  SELECT x INTO ln FROM jsonb_array_elements(sub.plan_lines) x WHERE x->>'service' = b.service::text LIMIT 1;
  sz := NULLIF(ln->>'size_tier','')::smallint; cad := coalesce(ln->>'cadence', b.cadence); surch := coalesce((ln->>'surcharge_applied')::boolean, false);
  stop := CASE WHEN sub.cancel_at_period_end AND sub.next_billing_date IS NOT NULL THEN least(_until, sub.next_billing_date - 1) ELSE _until END;
  kind := public.sched_std_kind(b.service);
  pay := coalesce(public.contractor_visit_pay_cents(b.service::text, sz, cad, NULL, surch, kind), NULLIF(ln->>'contractor_pay_cents','')::int);
  xpay := public.contractor_visit_pay_cents('cleaning', sz, 'monthly', NULL, surch, 'quarterly_deep_clean');
  FOR d IN SELECT public.sched_dates(b.service, b.cadence, b.first_visit_date, stop, 1000) LOOP
    IF d >= today AND d >= public.sched_launch_date() THEN
      IF b.service::text = 'cleaning' AND b.cadence = 'weekly' AND idx % 13 = 12 THEN
        IF public.sched_place_visit(_b, d, 'quarterly_deep_clean', xpay, false) THEN made := made + 1; END IF;
      ELSE
        IF public.sched_place_visit(_b, d, kind, pay, false) THEN made := made + 1; END IF;
      END IF;
    END IF;
    idx := idx + 1;
  END LOOP;
  -- Car Care: full detail twice a year (months 0 and 6), in the week-3 slot.
  IF b.service::text = 'detailing' THEN
    xpay := public.contractor_visit_pay_cents('detailing', sz, 'monthly', NULL, false, 'full_detail');
    FOR k IN 0..24 LOOP
      ms := public.sched_month_anchor(b.first_visit_date, k);
      EXIT WHEN ms > stop;
      IF k % 6 = 0 AND ms + 14 >= today AND ms + 14 <= stop AND ms + 14 >= public.sched_launch_date() THEN
        IF public.sched_place_visit(_b, ms + 14, 'full_detail', xpay, false) THEN made := made + 1; END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN made;
END $$;

-- 4. Preferred language for every customer and Pro.
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';
ALTER TABLE public.applicants ADD CONSTRAINT applicants_preferred_language_chk CHECK (preferred_language IN ('en','es'));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_language_chk CHECK (trim(language) IN ('en','es')) NOT VALID;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, phone, referral_code, language)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'last_name', NEW.raw_user_meta_data ->> 'phone',
    public.generate_referral_code(), CASE WHEN NEW.raw_user_meta_data ->> 'language' = 'es' THEN 'es' ELSE 'en' END)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_lang(_uid uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT trim(language) FROM public.profiles WHERE user_id = _uid),
    (SELECT preferred_language FROM public.applicants WHERE contractor_id = _uid ORDER BY created_at DESC LIMIT 1),
    'en')
$$;

CREATE OR REPLACE FUNCTION public.set_my_language(_lang text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _lang NOT IN ('en','es') THEN RAISE EXCEPTION 'invalid_language'; END IF;
  UPDATE public.profiles SET language = _lang WHERE user_id = auth.uid();
  UPDATE public.applicants SET preferred_language = _lang WHERE contractor_id = auth.uid();
  RETURN _lang;
END $$;
REVOKE ALL ON FUNCTION public.set_my_language(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_language(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.my_language() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.user_lang(auth.uid()) $$;
REVOKE ALL ON FUNCTION public.my_language() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_language() TO authenticated;
REVOKE ALL ON FUNCTION public.user_lang(uuid) FROM PUBLIC, anon, authenticated;

-- Spanish for every scheduling token and message.
CREATE OR REPLACE FUNCTION public.sched_es_tok(_t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE m text[]; t text := trim(coalesce(_t, ''));
  days_en text[] := ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  days_es text[] := ARRAY['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
  mon_en text[] := ARRAY['january','february','march','april','may','june','july','august','september','october','november','december'];
  mon_es text[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
BEGIN
  m := regexp_match(t, '^(\w+) (\d{1,2}) (\w+)$');
  IF m IS NOT NULL AND array_position(days_en, lower(m[1])) IS NOT NULL AND array_position(mon_en, lower(m[3])) IS NOT NULL THEN
    RETURN days_es[array_position(days_en, lower(m[1]))] || ' ' || m[2] || ' de ' || mon_es[array_position(mon_en, lower(m[3]))];
  END IF;
  IF array_position(days_en, lower(t)) IS NOT NULL THEN RETURN days_es[array_position(days_en, lower(t))]; END IF;
  RETURN CASE t
    WHEN 'Cleaning' THEN 'Limpieza' WHEN 'cleaning' THEN 'limpieza'
    WHEN 'Lawn' THEN 'Cuidado del césped' WHEN 'lawn' THEN 'cuidado del césped'
    WHEN 'Car Care' THEN 'Cuidado del Auto' WHEN 'car care' THEN 'Cuidado del Auto'
    WHEN 'weekly' THEN 'cada semana' WHEN 'biweekly' THEN 'cada dos semanas' WHEN 'monthly' THEN 'una vez al mes'
    WHEN 'Done by 6:00 PM' THEN 'lista antes de las 6:00 PM'
    ELSE t END;
END $$;

CREATE OR REPLACE FUNCTION public.sched_es(_t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE m text[]; t text := coalesce(_t, ''); suffix text := '';
BEGIN
  IF t = '' THEN RETURN _t; END IF;
  IF t LIKE '% Same Pro, rescheduled within 48 hours.' THEN
    t := left(t, length(t) - length(' Same Pro, rescheduled within 48 hours.'));
    suffix := ' Mismo Pro, reprogramada dentro de 48 horas.';
  END IF;
  -- titles
  CASE t
    WHEN 'Your Tidy day is confirmed' THEN RETURN 'Tu día de Tidy está confirmado';
    WHEN 'Your Pro has changed' THEN RETURN 'Tu Pro cambió';
    WHEN 'Your visit has moved' THEN RETURN 'Tu visita cambió de día';
    WHEN 'A spot opened for you' THEN RETURN 'Se abrió un lugar para ti';
    WHEN 'Please choose a new day' THEN RETURN 'Elige un nuevo día';
    WHEN 'You''re on the waitlist' THEN RETURN 'Estás en la lista de espera';
    WHEN 'Your Tidy visit is tomorrow' THEN RETURN 'Tu visita de Tidy es mañana';
    WHEN 'Customers can now book this day.' THEN RETURN 'Los clientes ya pueden reservar este día.';
    WHEN 'Choose your Tidy day' THEN RETURN 'Elige tu día de Tidy';
    ELSE NULL;
  END CASE;
  m := regexp_match(t, '^(.+) every (\w+)(?: \((.+)\))?, (\w+)\. First visit (.+)\. Your Pro is (.+)\.$');
  IF m IS NOT NULL THEN RETURN format('%s cada %s%s, %s. Primera visita: %s. Tu Pro es %s.', public.sched_es_tok(m[1]), public.sched_es_tok(m[2]),
    CASE WHEN m[3] IS NULL THEN '' ELSE ' (' || public.sched_es_tok(m[3]) || ')' END, public.sched_es_tok(m[4]), public.sched_es_tok(m[5]), m[6]) || suffix; END IF;
  m := regexp_match(t, '^Tidy: your (.+) day is (\w+), (.+)\. First visit (.+)\. Your Pro is (.+)\.$');
  IF m IS NOT NULL THEN RETURN format('Tidy: tu día de %s es el %s, %s. Primera visita: %s. Tu Pro es %s.', public.sched_es_tok(m[1]), public.sched_es_tok(m[2]), public.sched_es_tok(m[3]), public.sched_es_tok(m[4]), m[5]); END IF;
  m := regexp_match(t, '^(Tidy: y|Y)our (.+) Pro is now (.+)\.$');
  IF m IS NOT NULL THEN RETURN format('%sTu Pro de %s ahora es %s.', CASE WHEN m[1] = 'Y' THEN '' ELSE 'Tidy: ' END, public.sched_es_tok(m[2]), m[3]); END IF;
  m := regexp_match(t, '^New customer on your (\w+)$');
  IF m IS NOT NULL THEN RETURN format('Nuevo cliente en tu %s', public.sched_es_tok(m[1])); END IF;
  m := regexp_match(t, '^A (.+) customer in (\d+) was added to your (\w+), starting (.+)\.$');
  IF m IS NOT NULL THEN RETURN format('Se agregó un cliente de %s en %s a tu %s, a partir del %s.', public.sched_es_tok(m[1]), m[2], public.sched_es_tok(m[3]), public.sched_es_tok(m[4])); END IF;
  m := regexp_match(t, '^(\w+) in (\d+) is open — claim it in your schedule\.$');
  IF m IS NOT NULL THEN RETURN format('El %s en %s está disponible. Resérvalo en tu horario.', public.sched_es_tok(m[1]), m[2]); END IF;
  m := regexp_match(t, '^(\w+) in (\d+) is open$');
  IF m IS NOT NULL THEN RETURN format('El %s en %s está disponible', public.sched_es_tok(m[1]), m[2]); END IF;
  m := regexp_match(t, '^Your (\w+) in (\d+) is live$');
  IF m IS NOT NULL THEN RETURN format('Tu %s en %s ya está activo', public.sched_es_tok(m[1]), m[2]); END IF;
  m := regexp_match(t, '^(\w+) in (\d+) ends (.+)$');
  IF m IS NOT NULL THEN RETURN format('El %s en %s termina el %s', public.sched_es_tok(m[1]), m[2], public.sched_es_tok(m[3])); END IF;
  m := regexp_match(t, '^Your last (\w+) in (\d+) is before (.+)\.$');
  IF m IS NOT NULL THEN RETURN format('Tu último %s en %s es antes del %s.', public.sched_es_tok(m[1]), m[2], public.sched_es_tok(m[3])); END IF;
  m := regexp_match(t, '^Your Tidy visit has moved from (\w+) to (\w+) — same Pro, same window\. Reply if that day doesn''t work\.$');
  IF m IS NOT NULL THEN RETURN format('Tu visita de Tidy cambió del %s al %s — mismo Pro, mismo horario. Responde si ese día no te funciona.', public.sched_es_tok(m[1]), public.sched_es_tok(m[2])) || suffix; END IF;
  m := regexp_match(t, '^Your Tidy visit has moved from (\w+) to (\w+) — same Pro, (.+)\. Reply if that day doesn''t work\.$');
  IF m IS NOT NULL THEN RETURN format('Tu visita de Tidy cambió del %s al %s — mismo Pro, %s. Responde si ese día no te funciona.', public.sched_es_tok(m[1]), public.sched_es_tok(m[2]), public.sched_es_tok(m[3])) || suffix; END IF;
  m := regexp_match(t, '^A (\w+) (.+) spot opened in (\d+)\. It''s held for you for 48 hours — choose it in your Tidy schedule\.$');
  IF m IS NOT NULL THEN RETURN format('Se abrió un lugar de %s el %s en %s. Lo guardamos para ti por 48 horas — elígelo en tu horario de Tidy.', public.sched_es_tok(m[2]), public.sched_es_tok(m[1]), m[3]); END IF;
  m := regexp_match(t, '^Tidy: a (\w+) (.+) spot opened\. It''s held for you for 48 hours — choose it in your Tidy schedule\.$');
  IF m IS NOT NULL THEN RETURN format('Tidy: se abrió un lugar de %s el %s. Lo guardamos para ti por 48 horas — elígelo en tu horario de Tidy.', public.sched_es_tok(m[2]), public.sched_es_tok(m[1])); END IF;
  m := regexp_match(t, '^From (.+) your (\w+) (.+) day is no longer available\. Choose another day in your Tidy schedule before then\.$');
  IF m IS NOT NULL THEN RETURN format('A partir del %s, tu día de %s del %s ya no está disponible. Elige otro día en tu horario de Tidy antes de esa fecha.', public.sched_es_tok(m[1]), public.sched_es_tok(m[3]), public.sched_es_tok(m[2])); END IF;
  m := regexp_match(t, '^Tidy: from (.+) your (\w+) (.+) day changes\. Pick a new day in your Tidy schedule, or reply and we''ll help\.$');
  IF m IS NOT NULL THEN RETURN format('Tidy: a partir del %s cambia tu día de %s del %s. Elige un nuevo día en tu horario de Tidy, o responde y te ayudamos.', public.sched_es_tok(m[1]), public.sched_es_tok(m[3]), public.sched_es_tok(m[2])); END IF;
  m := regexp_match(t, '^Your (.+) day ended and no other day had room yet\. You''re first in line — we''ll offer the next opening and hold it 48 hours\.$');
  IF m IS NOT NULL THEN RETURN format('Tu día de %s terminó y todavía no había lugar en otro día. Eres el primero en la lista — te ofreceremos el próximo lugar y lo guardaremos por 48 horas.', public.sched_es_tok(m[1])); END IF;
  m := regexp_match(t, '^(Reminder: your Tidy|Tidy reminder: your) (.+) visit is tomorrow, (.*)\.$');
  IF m IS NOT NULL THEN RETURN format('%s %s es mañana%s.', CASE WHEN m[1] LIKE 'Reminder%' THEN 'Recordatorio: tu visita de Tidy de' ELSE 'Recordatorio de Tidy: tu visita de' END,
    public.sched_es_tok(m[2]), CASE WHEN trim(m[3]) = '' THEN '' ELSE ', ' || public.sched_es_tok(m[3]) END); END IF;
  m := regexp_match(t, '^(Tidy: y|Y)our (.+) plan is active, but you haven''t chosen your day yet\. Pick it in your Tidy schedule: (\S+)$');
  IF m IS NOT NULL THEN RETURN format('%stu plan de %s está activo, pero todavía no has elegido tu día. Elígelo en tu horario de Tidy: %s', CASE WHEN m[1] = 'Y' THEN 'T' ELSE 'Tidy: ' END, public.sched_es_tok(m[2]), m[3]); END IF;
  RETURN _t;
END $$;

CREATE OR REPLACE FUNCTION public.sched_pro_notice(_pro uuid, _kind text, _title text, _body text, _url text, _dedupe text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE es boolean := public.user_lang(_pro) = 'es';
BEGIN
  IF _dedupe IS NOT NULL AND NOT public.sched_once('pro:' || _dedupe) THEN RETURN; END IF;
  INSERT INTO public.pro_notifications (contractor_id, kind, title, body, url)
  VALUES (_pro, _kind, CASE WHEN es THEN public.sched_es(_title) ELSE _title END, CASE WHEN es THEN public.sched_es(_body) ELSE _body END, _url);
END $$;

CREATE OR REPLACE FUNCTION public.sched_customer_notice(_user uuid, _kind text, _title text, _body text, _dedupe text, _visit uuid, _sms text, _expires timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; digits text; e164 text; es boolean := public.user_lang(_user) = 'es';
BEGIN
  IF es THEN _title := public.sched_es(_title); _body := public.sched_es(_body); _sms := public.sched_es(_sms); END IF;
  BEGIN
    PERFORM public.notify_member(_user, _kind, _title, _body, _dedupe, _visit, NULL);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF _sms IS NULL THEN RETURN; END IF;
  SELECT phone, sms_opt_in, sms_opt_out INTO p FROM public.profiles WHERE user_id = _user;
  IF NOT FOUND OR p.phone IS NULL OR coalesce(p.sms_opt_in::text, 'false') <> 'true'
     OR (p.sms_opt_out IS NOT NULL AND p.sms_opt_out::text <> 'false') THEN RETURN; END IF;
  digits := regexp_replace(p.phone, '[^0-9]', '', 'g');
  e164 := CASE WHEN length(digits) = 10 THEN '+1' || digits WHEN length(digits) = 11 AND left(digits,1) = '1' THEN '+' || digits ELSE NULL END;
  IF e164 IS NULL THEN RETURN; END IF;
  INSERT INTO public.sms_outbox (to_phone_e164, body, idempotency_key, template_name, triggered_by, status, queued_reason, release_after, expires_at)
  VALUES (e164, _sms, 'sched-' || _dedupe, 'schedule_' || _kind, 'scheduling', 'queued', 'scheduling', now(), _expires)
  ON CONFLICT DO NOTHING;
END $$;

-- 5. Anyone with an active paid plan and no chosen day gets the day picker.
CREATE OR REPLACE FUNCTION public.sched_prompt_unbooked(_sub uuid DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; link text := 'https://jointidy.co/dashboard/schedule';
BEGIN
  FOR r IN
    SELECT s.id AS sub_id, s.user_id, (x->>'service') AS service
      FROM public.subscriptions s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.plan_lines, '[]'::jsonb)) x
     WHERE s.status::text = 'active' AND (_sub IS NULL OR s.id = _sub) AND s.user_id IS NOT NULL
       AND x->>'service' IN ('cleaning','lawn','detailing')
       AND NOT EXISTS (SELECT 1 FROM public.customer_bookings b WHERE b.subscription_id = s.id AND b.service::text = x->>'service' AND b.status = 'active')
       AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id AND u.email ILIKE '%@tidytestmail.com')  -- QA inboxes never receive mail
  LOOP
    PERFORM public.sched_customer_notice(r.user_id, 'choose_day', 'Choose your Tidy day',
      format('Your %s plan is active, but you haven''t chosen your day yet. Pick it in your Tidy schedule: %s', lower(public.sched_svc_label(r.service::public.service_type)), link),
      'choose-day-' || r.sub_id || '-' || r.service, NULL,
      format('Tidy: your %s plan is active, but you haven''t chosen your day yet. Pick it in your Tidy schedule: %s', lower(public.sched_svc_label(r.service::public.service_type)), link), NULL);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.sched_prompt_unbooked(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sched_prompt_unbooked(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sched_subscription_prompt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text = 'active' THEN
    BEGIN PERFORM public.sched_prompt_unbooked(NEW.id); EXCEPTION WHEN others THEN NULL; END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscriptions_choose_day AFTER INSERT OR UPDATE OF status, plan_lines ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sched_subscription_prompt();

REVOKE ALL ON FUNCTION public.sched_es(text), public.sched_es_tok(text), public.sched_pro_notice(uuid,text,text,text,text,text),
  public.sched_customer_notice(uuid,text,text,text,text,uuid,text,timestamptz), public.sched_generate_booking(uuid,date), public.sched_budget(public.service_type,smallint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sched_es(text), public.sched_es_tok(text), public.sched_pro_notice(uuid,text,text,text,text,text),
  public.sched_customer_notice(uuid,text,text,text,text,uuid,text,timestamptz), public.sched_generate_booking(uuid,date), public.sched_budget(public.service_type,smallint,text)
  TO service_role;