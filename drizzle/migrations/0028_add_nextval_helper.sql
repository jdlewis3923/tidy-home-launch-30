-- Helper to read sequence values from edge functions without raw SQL.
CREATE OR REPLACE FUNCTION public.nextval(seq_name text)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval(seq_name::regclass);
$$;

GRANT EXECUTE ON FUNCTION public.nextval(text) TO authenticated, service_role;
