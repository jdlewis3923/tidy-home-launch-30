CREATE OR REPLACE FUNCTION public.pipeline_missing(_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; a public.applicants; m text[] := '{}';
  has_art boolean;
BEGIN
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id;
  SELECT * INTO a FROM public.applicants WHERE id = _id;
  IF p.applicant_id IS NULL THEN RETURN ARRAY['no pipeline record']; END IF;

  IF p.stage = 'applied' THEN
    IF p.apply_submitted_at IS NULL THEN m := array_append(m, 'Application submitted through /apply'::text); END IF;
    IF p.service IS NULL THEN m := array_append(m, 'Service (cleaning, lawn or car care)'::text); END IF;
    IF coalesce(length(regexp_replace(coalesce(a.phone,''), '\D', '', 'g')), 0) < 10 THEN m := array_append(m, 'Phone'::text); END IF;
    IF coalesce(a.email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN m := array_append(m, 'Email'::text); END IF;
    IF p.source IS NULL THEN m := array_append(m, 'Source (Indeed, hanger, referral or other)'::text); END IF;
  ELSIF p.stage = 'screened' THEN
    IF p.screening_call_completed_at IS NULL THEN m := array_append(m, 'Screening call completed'::text); END IF;
    IF length(trim(coalesce(p.call_notes, ''))) < 20 THEN m := array_append(m, 'Call notes (at least 20 characters)'::text); END IF;
    IF p.owns_equipment IS NULL THEN m := array_append(m, 'Owns equipment — answered yes or no'::text); END IF;
    IF p.drive_time_minutes IS NULL THEN m := array_append(m, 'Drive time recorded'::text);
    ELSIF p.drive_time_minutes > 30 THEN m := array_append(m, 'Drive time is over 30 minutes'::text); END IF;
    IF coalesce(p.screening_decision, '') <> 'advance' THEN m := array_append(m, 'Screening decision: Advance'::text); END IF;
  ELSIF p.stage = 'agreement' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'ica_signed') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'Signed ICA uploaded'::text); END IF;
    IF p.ica_countersigned_at IS NULL THEN m := array_append(m, 'ICA countersigned'::text); END IF;
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'w9') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'W-9 uploaded'::text); END IF;
    IF p.welcome_t1_sent_at IS NULL THEN m := array_append(m, 'WELCOME-T1 sent'::text); END IF;
  ELSIF p.stage = 'ins_quote' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'insurance_quote') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'Insurance quote uploaded'::text); END IF;
    IF length(trim(coalesce(p.quote_carrier, ''))) = 0 THEN m := array_append(m, 'Quote carrier'::text); END IF;
    IF coalesce(p.quote_limit_occurrence, 0) < 1000000 THEN m := array_append(m, 'Quote per-occurrence limit of at least $1,000,000'::text); END IF;
    IF coalesce(p.quote_limit_aggregate, 0) < 2000000 THEN m := array_append(m, 'Quote aggregate limit of at least $2,000,000'::text); END IF;
    IF p.quote_names_tidy_as_ai IS NOT TRUE THEN m := array_append(m, 'Quote names Tidy as additional insured'::text); END IF;
  ELSIF p.stage = 'background' THEN
    IF p.spend_confirmed_at IS NULL THEN m := array_append(m, 'Background check spend confirmed'::text); END IF;
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'checkr_report') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'Checkr report uploaded'::text); END IF;
    IF p.checkr_result IS NULL THEN m := array_append(m, 'Checkr result recorded'::text);
    ELSIF p.checkr_result <> 'clear' THEN m := array_append(m, 'Checkr result must be clear to advance'::text); END IF;
  ELSIF p.stage = 'insured' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'coi') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'Certificate of insurance uploaded'::text); END IF;
    IF p.coi_effective_date IS NULL THEN m := array_append(m, 'COI effective date'::text); END IF;
    IF p.coi_expiry_date IS NULL THEN m := array_append(m, 'COI expiry date'::text);
    ELSIF p.coi_expiry_date <= current_date THEN m := array_append(m, 'COI expiry date must be in the future'::text); END IF;
    IF coalesce(p.coi_limit_occurrence, 0) < 1000000 THEN m := array_append(m, 'COI per-occurrence limit of at least $1,000,000'::text); END IF;
    IF coalesce(p.coi_limit_aggregate, 0) < 2000000 THEN m := array_append(m, 'COI aggregate limit of at least $2,000,000'::text); END IF;
    IF p.coi_names_tidy_as_ai IS NOT TRUE THEN m := array_append(m, 'COI names Tidy as additional insured'::text); END IF;
    IF p.insurance_reimbursement_start_month IS NULL THEN m := array_append(m, 'Insurance reimbursement start month'::text); END IF;
  ELSIF p.stage = 'active' THEN
    IF p.kit_issued_at IS NULL THEN m := array_append(m, 'Kit issued'::text); END IF;
    IF coalesce(a.pro_number, '') !~ '^TIDY-\d{4}$' THEN m := array_append(m, 'Badge number assigned (TIDY-0000)'::text); END IF;
    IF NOT p.route_confirmed OR coalesce(array_length(p.service_days, 1), 0) = 0 THEN m := array_append(m, 'Route confirmed with service days'::text); END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contractor_spend WHERE applicant_id = _id AND category = 'kit') THEN m := array_append(m, 'Kit spend recorded'::text); END IF;
  END IF;
  RETURN m;
END $$;