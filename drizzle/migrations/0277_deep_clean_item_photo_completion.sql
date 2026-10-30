CREATE TABLE public.deep_clean_item_checks (
 attach_id uuid NOT NULL REFERENCES public.addon_attaches(id) ON DELETE CASCADE,
 scope_row_id uuid NOT NULL REFERENCES public.service_scope(id),
 pro_id uuid NOT NULL, photo_id uuid NOT NULL REFERENCES public.visit_photos(id), checked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(attach_id,scope_row_id), UNIQUE(attach_id,photo_id)
);
GRANT SELECT ON public.deep_clean_item_checks TO authenticated;
GRANT ALL ON public.deep_clean_item_checks TO service_role;
ALTER TABLE public.deep_clean_item_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY deep_clean_checks_read ON public.deep_clean_item_checks FOR SELECT TO authenticated USING(pro_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.deep_clean_photo_check(_attach uuid,_scope uuid,_photo uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.addon_attaches; v public.visits;
BEGIN
 SELECT * INTO a FROM public.addon_attaches WHERE id=_attach;
 IF NOT FOUND OR a.addon_key<>'deep_clean' THEN RAISE EXCEPTION 'deep_clean_required'; END IF;
 SELECT * INTO v FROM public.visits WHERE id=a.visit_id;
 IF NOT public.pro_on_cleaning_team_visit(v.id,auth.uid()) OR v.status::text IN ('complete','canceled','blocked','skipped') THEN RAISE EXCEPTION 'not_on_open_visit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.service_scope WHERE id=_scope AND addon_key='deep_clean' AND active) THEN RAISE EXCEPTION 'invalid_item'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.visit_photos WHERE id=_photo AND visit_id=v.id AND pro_id=auth.uid() AND kind='after') THEN RAISE EXCEPTION 'after_photo_required'; END IF;
 INSERT INTO public.deep_clean_item_checks(attach_id,scope_row_id,pro_id,photo_id) VALUES(_attach,_scope,auth.uid(),_photo) ON CONFLICT(attach_id,scope_row_id) DO UPDATE SET pro_id=excluded.pro_id,photo_id=excluded.photo_id,checked_at=now();
END $$;
REVOKE ALL ON FUNCTION public.deep_clean_photo_check(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deep_clean_photo_check(uuid,uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.deep_clean_attach_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mins integer; multiplier integer;
BEGIN
 IF NEW.addon_key<>'deep_clean' THEN RETURN NEW; END IF;
 IF NEW.is_free THEN RAISE EXCEPTION 'deep_clean_not_giftable'; END IF;
 IF NEW.status='completed' THEN
 IF EXISTS(SELECT 1 FROM public.service_scope s WHERE s.addon_key='deep_clean' AND s.active AND NOT EXISTS(SELECT 1 FROM public.deep_clean_item_checks c WHERE c.attach_id=NEW.id AND c.scope_row_id=s.id)) THEN RAISE EXCEPTION 'deep_clean_six_after_photos_required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER deep_clean_attach_guard BEFORE INSERT OR UPDATE ON public.addon_attaches FOR EACH ROW EXECUTE FUNCTION public.deep_clean_attach_guard();