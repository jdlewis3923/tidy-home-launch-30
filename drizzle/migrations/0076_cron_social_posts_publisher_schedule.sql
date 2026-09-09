-- lovable-cron-fallback-reviewed: 1440 runs/day; already scheduled in the hosted database, committing to source control only
SELECT cron.schedule('social-posts-publisher', '* * * * *', $job$SELECT public.dispatch_due_social_posts();$job$);
