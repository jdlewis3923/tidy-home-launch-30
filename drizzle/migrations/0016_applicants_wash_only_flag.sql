-- Detail Pros who complete the checklist WITHOUT the optional pressure-washer
-- photo are still approvable; they are flagged wash-only instead.
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS wash_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.applicants.wash_only IS
  'True when a Detail Pro has no approved pressure_washer equipment photo. Eligible for Wash jobs only, not full Detail. Set by equipment-photo-review; applicants cannot set it themselves.';

-- Applicants must never be able to set this on insert (privilege-escalation guard,
-- same pattern as the other status fields).
CREATE OR REPLACE FUNCTION public.force_applicant_safe_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and public.has_role(auth.uid(), 'admin'::app_role) then
    return new;
  end if;

  new.bg_check_status := null;
  new.compliance_complete := false;
  new.contracts_signed := false;
  new.stripe_connect_complete := false;
  new.training_passed := false;
  new.equipment_approved := false;
  new.wash_only := false;
  new.tier := 'tier_1_verified';
  new.coi_review_status := 'pending_upload';
  new.insurance_status := 'not_started';
  new.current_stage := 'applied';
  new.contractor_id := null;
  new.completed_visits := 0;
  new.contractor_cancel_count := 0;
  new.complaint_count := 0;
  new.photos_uploaded_count := 0;
  new.photos_expected_count := 0;
  new.total_ratings_count := 0;
  new.avg_customer_rating := null;

  return new;
end;
$function$;

-- Migrate any existing photos keyed to the retired Detail item so history is kept.
UPDATE public.applicant_equipment_photos
   SET photo_type = 'hose_nozzle_buckets'
 WHERE photo_type = 'pressure_washer_or_water_source';