-- Purge marker for claim photos (the photo_paths CHECK requires >= 1 path,
-- so purging is tracked here instead of clearing the array).
ALTER TABLE public.damage_claims ADD COLUMN IF NOT EXISTS photos_purged_at timestamptz;

-- Member notice when a damage claim is resolved: written to
-- member_notifications first; member-ops-tick emails it afterwards, so a
-- failed send can never undo the resolution.
CREATE OR REPLACE FUNCTION public.damage_claim_close_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    INSERT INTO public.member_notifications (user_id, kind, title, body, dedupe_key, related_visit_id)
    VALUES (
      NEW.user_id,
      'damage_claim_closed',
      'Your damage report is resolved',
      'We finished reviewing the damage you reported. ' || coalesce(NULLIF(btrim(NEW.admin_notes), ''), 'Everything is noted on your account — reply to this email if anything is still open.'),
      'damage-closed-' || NEW.id,
      NEW.visit_id
    );
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER damage_claims_close_notice AFTER UPDATE OF status ON public.damage_claims
  FOR EACH ROW EXECUTE FUNCTION public.damage_claim_close_notice();

-- Daily 6:30 AM ET (10:30 UTC): enforce the 30-day photo promise.
SELECT cron.schedule('visit-photo-retention-daily', '30 10 * * *', $job$SELECT public.cron_http_post('visit-photo-retention-daily', 'visit-photo-retention', '{}'::jsonb);$job$);