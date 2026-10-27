REVOKE SELECT (gate_code, access_notes) ON public.visits FROM authenticated, anon;
REVOKE SELECT ON public.visits FROM anon;
COMMENT ON COLUMN public.visits.gate_code IS 'Visit-day only for assigned Pro/team via pro_get_visits; not readable through the Data API.';