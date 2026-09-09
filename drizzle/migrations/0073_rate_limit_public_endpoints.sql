-- Per-identifier rate limiting for the unauthenticated edge functions.
-- The Supabase gateway does NOT rate limit function invocations (only auth
-- endpoints), so the public surfaces need their own counter. Kept in a table we
-- own so the limit survives isolate recycling and is auditable.

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.rate_limit_hits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_hits_id_seq TO service_role;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages rate limit hits"
  ON public.rate_limit_hits FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_ident_time_idx
  ON public.rate_limit_hits (bucket, identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_hits_created_at_idx
  ON public.rate_limit_hits (created_at);

-- Count-then-record in one statement so two concurrent requests cannot both
-- see a stale count. Returns {allowed, count, limit, retry_after_seconds}.
CREATE OR REPLACE FUNCTION public.rate_limit_take(
  _bucket TEXT,
  _identifier TEXT,
  _limit INTEGER,
  _window_seconds INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since TIMESTAMPTZ := now() - make_interval(secs => GREATEST(_window_seconds, 1));
  v_count INTEGER;
  v_oldest TIMESTAMPTZ;
BEGIN
  IF NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*), min(created_at) INTO v_count, v_oldest
  FROM public.rate_limit_hits
  WHERE bucket = _bucket AND identifier = _identifier AND created_at >= v_since;

  IF v_count >= GREATEST(_limit, 1) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'limit', _limit,
      'retry_after_seconds',
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest + make_interval(secs => _window_seconds) - now())))::int)
    );
  END IF;

  INSERT INTO public.rate_limit_hits (bucket, identifier) VALUES (_bucket, _identifier);

  -- Opportunistic housekeeping: drop rows no window can still reference.
  IF random() < 0.02 THEN
    DELETE FROM public.rate_limit_hits WHERE created_at < now() - interval '2 days';
  END IF;

  RETURN jsonb_build_object('allowed', true, 'count', v_count + 1, 'limit', _limit);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_take(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_take(TEXT, TEXT, INTEGER, INTEGER) TO service_role;