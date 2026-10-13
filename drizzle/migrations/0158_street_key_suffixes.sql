CREATE OR REPLACE FUNCTION public.sched_street_key(_addr text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s text; w text; out text[] := '{}';
BEGIN
  s := lower(coalesce(_addr, ''));
  s := regexp_replace(s, '\s*(#|apt|unit|ste|suite)\s*\S*$', '');
  s := regexp_replace(s, '^\s*\d+[a-z]?\s+', '');
  s := btrim(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'));
  IF s = '' THEN RETURN NULL; END IF;
  FOREACH w IN ARRAY string_to_array(s, ' ') LOOP
    out := out || CASE w WHEN 'street' THEN 'st' WHEN 'avenue' THEN 'ave' WHEN 'av' THEN 'ave' WHEN 'parkway' THEN 'pkwy' WHEN 'road' THEN 'rd'
      WHEN 'drive' THEN 'dr' WHEN 'court' THEN 'ct' WHEN 'terrace' THEN 'ter' WHEN 'lane' THEN 'ln' WHEN 'place' THEN 'pl'
      WHEN 'boulevard' THEN 'blvd' WHEN 'circle' THEN 'cir' WHEN 'southwest' THEN 'sw' WHEN 'northwest' THEN 'nw'
      WHEN 'southeast' THEN 'se' WHEN 'northeast' THEN 'ne' ELSE w END;
  END LOOP;
  RETURN array_to_string(out, ' ');
END $$;