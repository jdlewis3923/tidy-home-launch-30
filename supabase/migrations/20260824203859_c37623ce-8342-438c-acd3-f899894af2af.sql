create or replace function public.force_applicant_safe_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists trg_force_applicant_safe_defaults on public.applicants;
create trigger trg_force_applicant_safe_defaults
before insert on public.applicants
for each row execute function public.force_applicant_safe_defaults();

create or replace function public.force_insurance_unverified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and public.has_role(auth.uid(), 'admin'::app_role) then
    return new;
  end if;

  new.verification_status := 'not_started';
  new.verified_at := null;
  new.verified_by := null;

  return new;
end;
$$;

drop trigger if exists trg_force_insurance_unverified on public.contractor_insurance;
create trigger trg_force_insurance_unverified
before insert on public.contractor_insurance
for each row execute function public.force_insurance_unverified();
