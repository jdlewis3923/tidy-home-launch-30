UPDATE public.chatbot_knowledge
SET content = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        content,
        'We''re not in that ZIP yet - we launched serving Pinecrest and parts of Kendall first.',
        'We''re not in that ZIP yet - we''re starting in Pinecrest and Kendall.'
      ),
      'Most new customers get their first visit within 7 days of signup, depending on which day of the week your route runs.',
      'Do not promise a first-visit date. Tidy is still building its founding crew, so first visits are scheduled individually - tell the customer their visit date will be confirmed with them directly once their route is live.'
    ),
    'Assigned to a fixed weekly route - same Pro shows up every visit (route ownership)',
    'Planned as a fixed route so the same Pro handles the same home wherever possible (route ownership)'
  ),
  'Do not state a launch date.',
  'Do not state a launch date.
STATUS: Tidy is pre-launch. There are no customers yet, no completed visits, and no customer reviews. Never say we have launched, never cite how many customers we have or what most customers experience, and never promise a first-visit timeframe.'
)
WHERE id = 'cdf7f5e3-35b6-4954-85a0-36892470fa8c';