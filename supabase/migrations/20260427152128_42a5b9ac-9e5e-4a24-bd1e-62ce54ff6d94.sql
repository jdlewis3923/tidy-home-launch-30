-- Reset day 1 social post (was failed due to FB discovery error blocking the whole run before our fix).
-- After fix, ensureCredentials no longer throws on missing FB creds; IG and FB are attempted independently.
UPDATE public.social_posts
  SET status = 'scheduled', error_message = NULL
  WHERE day_number = 1 AND status = 'failed';