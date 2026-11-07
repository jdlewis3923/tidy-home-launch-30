ALTER TABLE public.pro_paperwork_emails DROP CONSTRAINT pro_paperwork_emails_kind_check;
ALTER TABLE public.pro_paperwork_emails ADD CONSTRAINT pro_paperwork_emails_kind_check CHECK (kind IN ('welcome','reminder48','reminder5d','complete','test','apology_20261107'));
CREATE OR REPLACE FUNCTION public.connecteam_commit_paperwork(_user bigint, _status jsonb, _complete boolean, _signed_at timestamptz, _expiry timestamptz, _coi_approved boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE a uuid; ready boolean;
BEGIN
 ready := _complete AND coalesce(_status->>'intake' IN ('approved','completed'), false);
 UPDATE public.pro_pay_profiles SET paperwork_status=_status,paperwork_complete=ready,agreement_signed_at=_signed_at,coi_expires_at=_expiry,pay_setup_unblocked=ready,coi_verified_at=CASE WHEN _coi_approved THEN coalesce(coi_verified_at,now()) ELSE NULL END,paperwork_synced_at=now() WHERE connecteam_user_id=_user RETURNING applicant_id INTO a;
 IF a IS NOT NULL AND ready AND _signed_at IS NOT NULL THEN UPDATE public.applicants SET contracts_signed=true WHERE id=a AND NOT contracts_signed; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.connecteam_commit_paperwork(bigint,jsonb,boolean,timestamptz,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.connecteam_commit_paperwork(bigint,jsonb,boolean,timestamptz,timestamptz,boolean) TO service_role;