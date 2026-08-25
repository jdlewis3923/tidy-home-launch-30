DROP POLICY IF EXISTS "applicants insert public" ON public.applicants;

CREATE POLICY "applicants insert public"
ON public.applicants
FOR INSERT
TO anon, authenticated
WITH CHECK (
  contractor_id IS NULL
  AND COALESCE(current_stage, 'applied') = 'applied'
  AND bg_check_status IS NULL
  AND bg_check_provider IS NULL
  AND bg_check_completed_at IS NULL
  AND checkr_candidate_id IS NULL
  AND checkr_invitation_id IS NULL
  AND compliance_complete IS NOT TRUE
  AND COALESCE(contracts_signed, false) = false
  AND contracts_signed_at IS NULL
  AND COALESCE(stripe_connect_complete, false) = false
  AND stripe_account_id IS NULL
  AND COALESCE(training_passed, false) = false
  AND training_scheduled_at IS NULL
  AND COALESCE(equipment_approved, false) = false
  AND COALESCE(tier, 'tier_1_verified') = 'tier_1_verified'
  AND tier_advanced_at IS NULL
  AND tier_offer_sent_at IS NULL
  AND tier_offered_by IS NULL
  AND COALESCE(tier_readiness_status, 'not_started') = 'not_started'
  AND COALESCE(coi_review_status, 'pending_upload') = 'pending_upload'
  AND coi_review_notes IS NULL
  AND COALESCE(insurance_status, 'not_started') = 'not_started'
  AND insurance_expires_at IS NULL
  AND rejected_at IS NULL
  AND rejection_reason IS NULL
  AND jobber_id IS NULL
  AND google_review_match_name IS NULL
  AND last_jobber_event_at IS NULL
  AND last_review_match_at IS NULL
  AND last_visit_at IS NULL
  AND COALESCE(completed_visits, 0) = 0
  AND COALESCE(contractor_cancel_count, 0) = 0
  AND COALESCE(complaint_count, 0) = 0
  AND COALESCE(open_escalations_count, 0) = 0
  AND COALESCE(photos_uploaded_count, 0) = 0
  AND COALESCE(photos_expected_count, 0) = 0
  AND COALESCE(total_ratings_count, 0) = 0
  AND avg_customer_rating IS NULL
  AND contractor_cancel_rate IS NULL
  AND complaint_rate IS NULL
  AND photo_compliance_rate IS NULL
);