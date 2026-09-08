-- 1. call_edge_function is a service-role SSRF primitive. Trigger/definer code
--    calls it internally; no client role may ever execute it directly.
REVOKE ALL ON FUNCTION public.call_edge_function(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.call_edge_function(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.call_edge_function(text, jsonb) FROM authenticated;

-- 2. Plan-line snapshots live in a row; Stripe metadata carries only its id.
--    Stripe caps a metadata value at 500 characters, which any two-service cart
--    exceeded when the full JSON was stuffed in.
CREATE TABLE IF NOT EXISTS public.plan_line_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lines JSONB NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_line_sets_user_idx ON public.plan_line_sets (user_id);

GRANT SELECT ON public.plan_line_sets TO authenticated;
GRANT ALL ON public.plan_line_sets TO service_role;

ALTER TABLE public.plan_line_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own plan line sets are readable" ON public.plan_line_sets;
CREATE POLICY "own plan line sets are readable"
ON public.plan_line_sets
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
