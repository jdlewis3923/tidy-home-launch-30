CREATE OR REPLACE FUNCTION public.signing_selftest_fixture(_id uuid, _service text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applicants WHERE id=_id AND is_test_row) THEN RAISE EXCEPTION 'test_applicant_required'; END IF;
  PERFORM set_config('tidy.pipeline_move','on',true);
  INSERT INTO public.contractor_pipeline(applicant_id, service, stage, state, archived, is_test, proof_approved_at)
  VALUES (_id, _service, 'applied', 'open', false, true, now())
  ON CONFLICT (applicant_id) DO UPDATE SET service=EXCLUDED.service, stage='applied', state='open', archived=false, is_test=true, proof_approved_at=now();
  PERFORM set_config('tidy.pipeline_move','',true);
END $$;
REVOKE ALL ON FUNCTION public.signing_selftest_fixture(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signing_selftest_fixture(uuid,text) TO service_role;