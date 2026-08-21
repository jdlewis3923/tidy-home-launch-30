UPDATE public.chatbot_knowledge
SET content = REPLACE(
  content,
  'Refunds: We do not issue issue refunds for completed services, with one exception - the founding-member first-visit guarantee.',
  'Refunds: We do not issue refunds for completed services, with one exception - the founding-member first-visit guarantee.'
)
WHERE id = 'cdf7f5e3-35b6-4954-85a0-36892470fa8c';