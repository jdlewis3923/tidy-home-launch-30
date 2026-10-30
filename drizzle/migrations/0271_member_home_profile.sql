ALTER TABLE public.home_notes ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.validate_home_profile() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF jsonb_typeof(NEW.profile)<>'object' OR octet_length(NEW.profile::text)>1500000 THEN RAISE EXCEPTION 'invalid_home_profile'; END IF;
IF NEW.profile ? 'photos' AND (jsonb_typeof(NEW.profile->'photos')<>'array' OR jsonb_array_length(NEW.profile->'photos')>6) THEN RAISE EXCEPTION 'maximum_six_photos'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(NEW.profile->'photos','[]')) p WHERE p !~ '^data:image/(jpeg|webp);base64,' OR length(p)>240000) THEN RAISE EXCEPTION 'invalid_home_photo'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER home_profile_validate BEFORE INSERT OR UPDATE OF profile ON public.home_notes FOR EACH ROW EXECUTE FUNCTION public.validate_home_profile();
CREATE OR REPLACE FUNCTION public.pro_home_profile(_visit uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE v public.visits; BEGIN
SELECT * INTO v FROM public.visits WHERE id=_visit;
IF NOT FOUND OR NOT public.pro_on_cleaning_team_visit(v.id,auth.uid()) OR NOT public.pro_access_window_open(v.id,auth.uid()) THEN RETURN NULL; END IF;
RETURN (SELECT profile FROM public.home_notes WHERE user_id=v.user_id); END $$;
REVOKE ALL ON FUNCTION public.pro_home_profile(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pro_home_profile(uuid) TO authenticated,service_role;