DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.choose_free_addon(uuid,text,uuid)'::regprocedure) INTO src;
  src := replace(src, 'IF NOT (v.service::text = ANY (a.services)) THEN',
                      'IF NOT (v.service::text = ANY (a.services) OR (v.service::text = ''detailing'' AND ''detail'' = ANY (a.services))) THEN');
  EXECUTE src;
END $$;