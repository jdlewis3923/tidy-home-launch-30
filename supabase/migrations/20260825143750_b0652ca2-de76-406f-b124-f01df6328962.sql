DROP POLICY IF EXISTS "applicants insert public" ON public.applicants;

CREATE POLICY "applicants insert public"
ON public.applicants
FOR INSERT
TO anon, authenticated
WITH CHECK (
  contractor_id IS NULL
  AND COALESCE(current_stage, 'applied') = 'applied'
  AND bg_check_status IS NULL
  AND COALESCE(contracts_signed, false) = false
  AND COALESCE(stripe_connect_complete, false) = false
  AND COALESCE(training_passed, false) = false
  AND COALESCE(equipment_approved, false) = false
  AND COALESCE(tier, 'tier_1_verified') = 'tier_1_verified'
  AND COALESCE(coi_review_status, 'pending_upload') = 'pending_upload'
  AND COALESCE(insurance_status, 'not_started') = 'not_started'
  AND COALESCE(completed_visits, 0) = 0
  AND COALESCE(contractor_cancel_count, 0) = 0
  AND COALESCE(complaint_count, 0) = 0
  AND COALESCE(photos_uploaded_count, 0) = 0
  AND COALESCE(photos_expected_count, 0) = 0
  AND COALESCE(total_ratings_count, 0) = 0
  AND avg_customer_rating IS NULL
);

INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'insurance_additional_insured',
  jsonb_build_object(
    'required', true,
    'entity_name', 'Tidy Home Concierge LLC',
    'address_line1', '2121 Biscayne Blvd #1562',
    'city', 'Miami',
    'state', 'FL',
    'zip', '33137',
    'note', 'Additional Insured is not the same as Certificate Holder. Certificate Holder is informational only. Tidy will confirm any address requirements during manual review.'
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();