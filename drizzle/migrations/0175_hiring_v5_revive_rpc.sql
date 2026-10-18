-- hiring_revive: bring an archived-for-silence candidate back to their missed step,
-- once, within 7 days. Service-role only (called from the inbound SMS handler).
CREATE OR REPLACE FUNCTION public.hiring_revive(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; kind text;
BEGIN
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id;
  IF p.applicant_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT p.archived THEN RETURN jsonb_build_object('ok', false, 'error', 'not_archived'); END IF;
  IF p.revived_once THEN RETURN jsonb_build_object('ok', false, 'error', 'already_revived'); END IF;
  IF p.archived_at IS NULL OR p.archived_at < now() - interval '7 days' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late');
  END IF;
  IF p.archive_reason IS NULL OR p.archive_reason NOT IN
     ('no_apply','no_proof','no_booking','no_show_phone','no_confirm','no_show_interview','no_sign','no_bg_consent','no_coi') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_silence');
  END IF;
  IF p.archived_from_stage IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_stage'); END IF;

  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline SET
    archived = false, archived_at = NULL, state = 'open',
    stage = p.archived_from_stage, archive_reason = NULL, decline_reason = NULL,
    revived_once = true
  WHERE applicant_id = _id;

  kind := CASE p.archived_from_stage
    WHEN 'applied' THEN 'proof' WHEN 'proof' THEN 'proof'
    WHEN 'screen_booked' THEN 'book_phone' WHEN 'phone_screened' THEN 'book_inperson'
    WHEN 'referenced' THEN 'book_inperson' WHEN 'interviewed' THEN 'sign'
    WHEN 'agreement' THEN 'sign' WHEN 'background' THEN 'checkr_consent'
    WHEN 'insured' THEN 'coi' ELSE 'proof' END;
  PERFORM public.hiring_set_deadline(_id, kind, now() + interval '48 hours', now() + interval '24 hours');
  PERFORM public.pipeline_log(_id, 'note', NULL, NULL, 'declined', 'open', 'Revived by YES reply', jsonb_build_object('from_stage', p.archived_from_stage));
  RETURN jsonb_build_object('ok', true, 'stage', p.archived_from_stage);
END $$;
REVOKE ALL ON FUNCTION public.hiring_revive(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiring_revive(uuid) TO service_role;