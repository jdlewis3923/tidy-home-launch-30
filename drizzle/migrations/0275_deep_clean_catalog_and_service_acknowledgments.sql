ALTER TABLE public.addon_catalog ADD COLUMN IF NOT EXISTS display_name_es text, ADD COLUMN IF NOT EXISTS description_en text, ADD COLUMN IF NOT EXISTS description_es text, ADD COLUMN IF NOT EXISTS size_prices jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS added_minutes jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS pro_pay_pct numeric NOT NULL DEFAULT 40, ADD COLUMN IF NOT EXISTS discount_eligible boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS estate_bundle_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.service_scope ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE public.service_acknowledgments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid NOT NULL, service text NOT NULL,
 scope_version timestamptz NOT NULL, terms_version text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(),
 ip text, user_agent text, acceptance_ref text NOT NULL, scope_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
 UNIQUE(member_id,service,acceptance_ref)
);
GRANT SELECT ON public.service_acknowledgments TO authenticated;
GRANT ALL ON public.service_acknowledgments TO service_role;
ALTER TABLE public.service_acknowledgments ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_acknowledgments_read ON public.service_acknowledgments FOR SELECT TO authenticated USING (member_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX service_acknowledgments_member ON public.service_acknowledgments(member_id,service,checked_at DESC);
CREATE OR REPLACE FUNCTION public.deep_clean_catalog_quote(_addon_key text,_size integer,_quarterly boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.addon_catalog; cents integer; minutes integer; label text;
BEGIN
 SELECT * INTO a FROM public.addon_catalog WHERE addon_key=_addon_key AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown_addon'; END IF;
 IF a.estate_bundle_only AND _size IN (4,5) THEN RAISE EXCEPTION 'estate_deep_clean_only'; END IF;
 IF _addon_key='deep_clean' THEN
  IF _quarterly THEN RAISE EXCEPTION 'quarterly_deep_clean_already_included'; END IF;
  IF _size NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'written_walkthrough_quote_required'; END IF;
  cents:=(a.size_prices->>_size::text)::integer; minutes:=(a.added_minutes->>_size::text)::integer;
  label:=CASE _size WHEN 4 THEN 'Estate' WHEN 5 THEN 'Estate Plus' ELSE 'Size '||_size END;
 ELSE cents:=a.price_cents; minutes:=coalesce((a.added_minutes->>_size::text)::integer,20); END IF;
 IF cents IS NULL OR cents<=0 THEN RAISE EXCEPTION 'addon_price_unavailable'; END IF;
 RETURN jsonb_build_object('addon_key',a.addon_key,'price_cents',cents,'added_minutes',minutes,
 'lookup_key',CASE WHEN _addon_key='deep_clean' THEN 'addon_deep_clean_'||CASE _size WHEN 4 THEN 'estate' WHEN 5 THEN 'estate_plus' ELSE 'size'||_size END ELSE a.lookup_key END,
 'display_name',a.display_name||CASE WHEN label IS NOT NULL THEN ' ('||label||')' ELSE '' END,
 'gift_eligible',a.gift_eligible,'discount_eligible',a.discount_eligible);
END $$;
REVOKE ALL ON FUNCTION public.deep_clean_catalog_quote(text,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deep_clean_catalog_quote(text,integer,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_deep_clean_minutes(_minutes jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF jsonb_typeof(_minutes)<>'object' OR NOT (_minutes ?& ARRAY['1','2','3','4','5']) THEN RAISE EXCEPTION 'all_sizes_required'; END IF;
 FOR i IN 1..5 LOOP IF (_minutes->>i::text)::integer NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'invalid_minutes'; END IF; END LOOP;
 UPDATE public.addon_catalog SET added_minutes=_minutes,updated_at=now() WHERE addon_key='deep_clean';
END $$;
REVOKE ALL ON FUNCTION public.admin_deep_clean_minutes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_deep_clean_minutes(jsonb) TO authenticated;
