CREATE TABLE public.pro_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24),'hex'),
 kind text NOT NULL DEFAULT 'apply' CHECK (kind IN ('apply','finish_profile')),
 service text NOT NULL CHECK (service IN ('cleaning','lawn','car')),
 stage text NOT NULL DEFAULT 'draft' CHECK (stage IN ('draft','applied','phone_screen','equipment_check','hired','rejected','profile_complete')),
 lang text NOT NULL DEFAULT 'en',
 src text,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb,
 prefill jsonb NOT NULL DEFAULT '{}'::jsonb,
 skip_sections text[] NOT NULL DEFAULT '{}',
 files jsonb NOT NULL DEFAULT '{}'::jsonb,
 full_name text, email text, phone text,
 connecteam_user_id bigint,
 is_test boolean NOT NULL DEFAULT false,
 submitted_at timestamptz, stage_changed_at timestamptz, hired_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pro_applications_stage_idx ON public.pro_applications(stage, submitted_at DESC);
GRANT ALL ON public.pro_applications TO service_role;
ALTER TABLE public.pro_applications ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.pro_applications IS 'Website Pro applications and finish-profile kit forms; written only by the pro-application edge function.';
ALTER TABLE public.pro_pay_profiles ADD COLUMN IF NOT EXISTS pro_application_id uuid REFERENCES public.pro_applications(id);
ALTER TABLE public.pro_pay_profiles ADD COLUMN IF NOT EXISTS kit_complete boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.connecteam_commit_paperwork(_user bigint, _status jsonb, _complete boolean, _signed_at timestamp with time zone, _expiry timestamp with time zone, _coi_approved boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a uuid; ready boolean; kit boolean;
BEGIN
 SELECT kit_complete INTO kit FROM public.pro_pay_profiles WHERE connecteam_user_id=_user;
 -- Kit, photo ID and badge photo come from the website form; Connecteam supplies agreement, W-9 and COI.
 ready := _complete AND coalesce(kit,false);
 UPDATE public.pro_pay_profiles SET paperwork_status=_status,paperwork_complete=ready,agreement_signed_at=_signed_at,coi_expires_at=_expiry,pay_setup_unblocked=ready,coi_verified_at=CASE WHEN _coi_approved THEN coalesce(coi_verified_at,now()) ELSE NULL END,paperwork_synced_at=now() WHERE connecteam_user_id=_user RETURNING applicant_id INTO a;
 IF a IS NOT NULL AND ready AND _signed_at IS NOT NULL THEN UPDATE public.applicants SET contracts_signed=true WHERE id=a AND NOT contracts_signed; END IF;
END $function$;