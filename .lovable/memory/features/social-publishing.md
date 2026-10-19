---
name: Social publishing
description: Sole app publisher, locked images, 90-day dedup, missed slots, 14-day preview; all-service reservations
type: feature
---

- The app (social-launch-publisher + social_publish_ledger) is the only publisher. ONE exception: LinkedIn posts go through the LINKEDIN_ZAP_WEBHOOK_URL secret (Zapier catch hook → LinkedIn company page). If the secret is missing, /admin/social shows a red banner and LinkedIn posts block.
- Nextdoor has no posting connection and must NEVER auto-post. Nextdoor rows are excluded from auto-claim and the missed-sweeper; /admin/social shows a manual card (Copy caption / Download image / Mark posted). Counted as posted only when an admin marks it (admin_mark_social_posted allows Nextdoor only).
- Instagram requires JPEG: PNG cards are auto-converted at publish time (sRGB, quality 90, 1080×1350 portrait or 1080×1080 square) and stored under social-images/derived/. The original PNG stays on the post and is what Facebook publishes. PNG is never a blocking flag.
- Each post's image is locked to the row (image_url + image_hash); never pick images by position. A post with no image, or an image/caption posted on that platform within 90 days (ledger + social_external_history), is blocked and shown red.
- Strict order by scheduled time, one post per platform per slot; a missed slot is marked "missed" and must be explicitly rescheduled — never posted late on top of the next one.
- /admin/social shows the next 14 days as cards with the exact image + caption per platform; Justin can swap an image or move a post there.
