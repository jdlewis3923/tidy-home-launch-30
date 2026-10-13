-- H1 clusters
CREATE OR REPLACE FUNCTION public.sched_cluster(_zip text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE left(coalesce(_zip,''),5) WHEN '33156' THEN 'pinecrest' WHEN '33183' THEN 'kendall' WHEN '33186' THEN 'kendall' END
$$;
CREATE OR REPLACE FUNCTION public.sched_cluster_zips(_c text)
 RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _c WHEN 'pinecrest' THEN ARRAY['33156'] WHEN 'kendall' THEN ARRAY['33183','33186'] ELSE ARRAY[_c] END
$$;

-- H2 pieces
CREATE OR REPLACE FUNCTION public.sched_visits_per_week(_s text, _cadence text)
 RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _s = 'detailing' THEN 0.7
    ELSE CASE lower(coalesce(_cadence,'monthly')) WHEN 'weekly' THEN 1 WHEN 'biweekly' THEN 0.5 ELSE 0.23 END END
$$;
CREATE OR REPLACE FUNCTION public.sched_day_capacity(_s text)
 RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s WHEN 'detailing' THEN 6.4 ELSE 8.0 END
$$;
CREATE OR REPLACE FUNCTION public.sched_days_needed(_s text, _hours numeric, _visits numeric)
 RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(_visits,0) <= 0 THEN 0 ELSE greatest(1, ceil(_hours / public.sched_day_capacity(_s))::int,
    CASE WHEN _s = 'cleaning' THEN ceil(_visits / 3.0)::int ELSE 0 END) END
$$;

-- One demand item per customer × service line: hours/week and visits/week.
-- _items: [{service, zip, cadence, size, car_wash ('monthly'|'biweekly'|null), pref_day}]
CREATE OR REPLACE FUNCTION public.sched_item_load(_i jsonb, OUT service text, OUT zip text, OUT hours numeric, OUT visits numeric)
 RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s text := _i->>'service'; sz smallint := CASE WHEN (_i->>'size') ~ '^\d+$' THEN (_i->>'size')::smallint END; v numeric; wash numeric;
BEGIN
  service := s; zip := left(_i->>'zip', 5);
  v := public.sched_visits_per_week(s, _i->>'cadence');
  hours := v * public.sched_budget(s::public.service_type, sz, public.sched_std_kind(s::public.service_type));
  visits := v;
  IF s = 'detailing' THEN   -- Shine Complete: plus two full details a year
    hours := hours + (2.0 / 52) * public.sched_budget('detailing', sz, 'full_detail');
    visits := visits + 2.0 / 52;
  END IF;
  RETURN;
END $$;

-- Demand source: active bookings (real) + unconverted reservations (projection).
CREATE OR REPLACE FUNCTION public.sched_demand_items()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('service', b.service::text, 'zip', b.zip, 'cadence', b.cadence,
           'size', (SELECT ln->>'size_tier' FROM public.subscriptions s2, jsonb_array_elements(s2.plan_lines) ln WHERE s2.id = b.subscription_id AND ln->>'service' = b.service::text LIMIT 1),
           'pref_day', b.weekday) x
      FROM public.customer_bookings b WHERE b.status = 'active'
    UNION ALL
    SELECT jsonb_build_object('service', CASE WHEN l->>'service' IN ('car','car_care') THEN 'detailing' ELSE l->>'service' END, 'zip', r.zip, 'cadence', l->>'cadence', 'size', l->>'size',
           'pref_day', CASE lower(coalesce(r.preferred_day,'')) WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 END)
      FROM public.reservations r, jsonb_array_elements(coalesce(r.lines, '[]'::jsonb)) l
     WHERE r.converted_at IS NULL AND coalesce(r.status,'') NOT IN ('cancelled','canceled') AND NOT coalesce(r.is_test_row, false)
       AND coalesce(l->>'size','') <> 'quote'
    UNION ALL   -- Car Wash Add-On jobs (car care Pro)
    SELECT jsonb_build_object('service', 'detailing_wash', 'zip', p.zip, 'cadence', CASE WHEN s.car_wash_key ILIKE '%biweekly%' THEN 'biweekly' ELSE 'monthly' END)
      FROM public.subscriptions s JOIN public.profiles p ON p.user_id = s.user_id WHERE s.status = 'active' AND s.car_wash_key IS NOT NULL
  ) q
$$;

-- H2 + H1 + H3 proposal. Pure over _items so it can be tested.
CREATE OR REPLACE FUNCTION public.sched_launch_proposal(_items jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE items jsonb := coalesce(_items, public.sched_demand_items()); out jsonb := '[]'::jsonb;
        svc text; cl text; z text; groups text[]; g text; h numeric; v numeric; n int; need int; wds int[]; chosen int[]; aligned int[]; split boolean;
BEGIN
  FOREACH svc IN ARRAY ARRAY['lawn','cleaning','detailing'] LOOP
    FOREACH cl IN ARRAY ARRAY['pinecrest','kendall'] LOOP
      -- H1: split Kendall into ZIP days only when one ZIP alone needs a full day.
      split := false;
      FOREACH z IN ARRAY public.sched_cluster_zips(cl) LOOP
        SELECT coalesce(sum(l.hours),0), coalesce(sum(l.visits),0) INTO h, v FROM jsonb_array_elements(items) i CROSS JOIN LATERAL public.sched_item_load(
          CASE WHEN i->>'service' = 'detailing_wash' THEN i || jsonb_build_object('service','detailing') ELSE i END) l
         WHERE (i->>'service' = svc OR (svc = 'detailing' AND i->>'service' = 'detailing_wash')) AND left(i->>'zip',5) = z;
        IF cardinality(public.sched_cluster_zips(cl)) > 1 AND (h >= public.sched_day_capacity(svc) OR (svc = 'cleaning' AND v >= 3)) THEN split := true; END IF;
      END LOOP;
      groups := CASE WHEN split THEN public.sched_cluster_zips(cl) ELSE ARRAY[cl] END;
      FOREACH g IN ARRAY groups LOOP
        SELECT coalesce(sum(l.hours),0), coalesce(sum(l.visits),0), count(*) FILTER (WHERE i->>'service' <> 'detailing_wash') INTO h, v, n
          FROM jsonb_array_elements(items) i CROSS JOIN LATERAL public.sched_item_load(
            CASE WHEN i->>'service' = 'detailing_wash' THEN i || jsonb_build_object('service','detailing') ELSE i END) l
         WHERE (i->>'service' = svc OR (svc = 'detailing' AND i->>'service' = 'detailing_wash'))
           AND (left(i->>'zip',5) = g OR (g = cl AND public.sched_cluster(i->>'zip') = cl));
        need := public.sched_days_needed(svc, h, v);           -- H1: zero customers → zero days
        -- H3: Mon–Thu ranked by this cluster's preferences (service first, then any service).
        SELECT array_agg(d ORDER BY ps DESC, pa DESC, d) INTO wds FROM (
          SELECT d,
            (SELECT count(*) FROM jsonb_array_elements(items) i WHERE (i->>'pref_day')::int = d AND i->>'service' = svc AND public.sched_cluster(i->>'zip') = cl) ps,
            (SELECT count(*) FROM jsonb_array_elements(items) i WHERE (i->>'pref_day')::int = d AND public.sched_cluster(i->>'zip') = cl) pa
          FROM generate_series(1,4) d) t;
        IF svc = 'detailing' THEN   -- align car care with the cluster's lawn/cleaning days
          SELECT coalesce(array_agg(DISTINCT (w)::int), '{}') INTO aligned FROM jsonb_array_elements(out) r, jsonb_array_elements_text(r->'weekdays') w
           WHERE r->>'cluster' = cl;
          SELECT array_agg(d ORDER BY (d = ANY(aligned)) DESC, array_position(wds, d)) INTO wds FROM unnest(wds) d;
        END IF;
        chosen := CASE WHEN need = 0 THEN '{}'::int[] ELSE wds[1:least(need, 4)] END;
        out := out || jsonb_build_object('service', svc, 'cluster', cl, 'zips', CASE WHEN g = cl THEN to_jsonb(public.sched_cluster_zips(cl)) ELSE jsonb_build_array(g) END,
          'customers', n, 'weekly_hours', round(h, 2), 'weekly_visits', round(v, 2), 'days_needed', need,
          'weekdays', to_jsonb(chosen), 'uncovered_days', greatest(need - 4, 0), 'aligned', svc = 'detailing' AND chosen && aligned);
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.sched_launch_proposal(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sched_launch_proposal(jsonb) TO service_role;

-- H4 approved launch calendar
CREATE TABLE IF NOT EXISTS public.sched_launch_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service public.service_type NOT NULL,
  zip text NOT NULL,
  weekday int NOT NULL CHECK (weekday BETWEEN 1 AND 4),
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  UNIQUE (service, zip, weekday)
);
GRANT SELECT ON public.sched_launch_calendar TO authenticated;
GRANT ALL ON public.sched_launch_calendar TO service_role;
ALTER TABLE public.sched_launch_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read launch calendar" ON public.sched_launch_calendar FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.sched_launch_locked(_s service_type)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(public.launch_conversion_open(CASE WHEN _s::text = 'detailing' THEN 'car' ELSE 'cleaning' END), false)
$$;

CREATE OR REPLACE FUNCTION public.admin_launch_proposal()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object('proposal', public.sched_launch_proposal(NULL),
    'approved', (SELECT coalesce(jsonb_agg(jsonb_build_object('service', service, 'zip', zip, 'weekday', weekday, 'approved_at', approved_at)), '[]'::jsonb) FROM public.sched_launch_calendar),
    'locked', jsonb_build_object('cleaning', public.sched_launch_locked('cleaning'), 'lawn', public.sched_launch_locked('lawn'), 'detailing', public.sched_launch_locked('detailing')));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_launch_proposal() TO authenticated;

-- Approve (or edit then approve). _rows: [{service, zips[], weekdays[]}]. Locks at conversion.
CREATE OR REPLACE FUNCTION public.admin_approve_launch_calendar(_rows jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb; z text; w text; s public.service_type; n_open int := 0; n_closed int := 0; pros int; slots int; spec text; d record; i int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOREACH s IN ARRAY ARRAY['cleaning','lawn','detailing']::public.service_type[] LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_rows) x WHERE x->>'service' = s::text) AND public.sched_launch_locked(s) THEN RAISE EXCEPTION 'calendar_locked'; END IF;
  END LOOP;
  DELETE FROM public.sched_launch_calendar c WHERE c.service::text IN (SELECT DISTINCT x->>'service' FROM jsonb_array_elements(_rows) x);
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    FOR z IN SELECT jsonb_array_elements_text(r->'zips') LOOP
      FOR w IN SELECT jsonb_array_elements_text(r->'weekdays') LOOP
        IF w::int NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'monday_to_thursday_only'; END IF;
        INSERT INTO public.sched_launch_calendar (service, zip, weekday, approved_by) VALUES ((r->>'service')::public.service_type, z, w::int, auth.uid()) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
  -- Apply: open approved days; close other days of those services that nobody claimed or booked.
  FOR d IN SELECT * FROM public.sched_launch_calendar LOOP
    IF NOT EXISTS (SELECT 1 FROM public.service_days x WHERE x.service = d.service AND x.zip = d.zip AND x.weekday = d.weekday AND x.active) THEN
      UPDATE public.service_days SET active = true, opened_at = now(), closed_at = NULL, close_effective = NULL WHERE service = d.service AND zip = d.zip AND weekday = d.weekday;
      IF NOT FOUND THEN INSERT INTO public.service_days (service, zip, weekday, active, opened_at) VALUES (d.service, d.zip, d.weekday, true, now()); END IF;
      n_open := n_open + 1;
    END IF;
  END LOOP;
  UPDATE public.service_days x SET active = false, closed_at = now()
   WHERE x.active AND x.service::text IN (SELECT DISTINCT r2->>'service' FROM jsonb_array_elements(_rows) r2)
     AND NOT EXISTS (SELECT 1 FROM public.sched_launch_calendar c WHERE c.service = x.service AND c.zip = x.zip AND c.weekday = x.weekday)
     AND NOT EXISTS (SELECT 1 FROM public.pro_day_claims c WHERE c.service = x.service AND c.zip = x.zip AND c.weekday = x.weekday AND c.status <> 'ended')
     AND NOT EXISTS (SELECT 1 FROM public.customer_bookings b WHERE b.service = x.service AND b.zip = x.zip AND b.weekday = x.weekday AND b.status = 'active');
  GET DIAGNOSTICS n_closed = ROW_COUNT;
  -- H4: more days than Pros can claim → hire spec now, naming the exact uncovered days.
  FOREACH s IN ARRAY ARRAY['cleaning','lawn','detailing']::public.service_type[] LOOP
    SELECT count(DISTINCT a.contractor_id) INTO pros FROM public.applicants a WHERE a.contractor_id IS NOT NULL AND s = ANY(public.sched_pro_services(a.contractor_id));
    i := 0;
    FOR d IN SELECT * FROM public.sched_launch_calendar c WHERE c.service = s
               AND NOT EXISTS (SELECT 1 FROM public.pro_day_claims p WHERE p.service = c.service AND p.zip = c.zip AND p.weekday = c.weekday AND p.status <> 'ended')
             ORDER BY c.weekday, c.zip LOOP
      i := i + 1;
      -- each Pro covers one ZIP per weekday, Mon–Thu
      CONTINUE WHEN i <= pros * 4 AND (SELECT count(*) FROM public.sched_launch_calendar c2 WHERE c2.service = s AND c2.weekday = d.weekday AND c2.zip <= d.zip) <= pros;
      spec := format('Hire a %s Pro for %s (%s), %s. Launch demand needs it and no Pro can claim it.', lower(public.sched_svc_label(s)), d.zip,
                     initcap(public.sched_cluster(d.zip)), public.sched_day_name(d.weekday));
      INSERT INTO public.hire_specs (service, zip, weekday, spec) VALUES (s, d.zip, d.weekday, spec) ON CONFLICT DO NOTHING;
      PERFORM public.sched_alert('schedule_hire', spec, 'From the approved launch calendar.', 'critical', '/admin/pipeline', 'launch-hire-' || s || '-' || d.zip || '-' || d.weekday);
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'opened', n_open, 'closed', n_closed);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_approve_launch_calendar(jsonb) TO authenticated;