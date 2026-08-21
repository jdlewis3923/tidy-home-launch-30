UPDATE public.chatbot_knowledge
SET content = REPLACE(
  REPLACE(
    content,
    'Assigned to a fixed weekly route — same Pro shows up every visit (route ownership)',
    'Planned as a fixed route so the same Pro handles the same home wherever possible (route ownership)'
  ),
  'We''re not in that ZIP yet — we launched serving Pinecrest and parts of Kendall first.',
  'We''re not in that ZIP yet — we''re starting in Pinecrest and Kendall.'
)
WHERE id = 'cdf7f5e3-35b6-4954-85a0-36892470fa8c';