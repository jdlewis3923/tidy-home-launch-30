CREATE OR REPLACE FUNCTION public.is_contractor_job_eligible(_contractor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.applicants a
    WHERE a.contractor_id = _contractor_id
      AND COALESCE(a.compliance_complete, false)
      AND a.stripe_connect_complete
      AND a.training_passed
      AND a.equipment_approved
      AND a.contracts_signed
  )
$function$;