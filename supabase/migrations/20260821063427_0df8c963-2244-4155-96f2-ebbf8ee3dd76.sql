UPDATE chatbot_knowledge
SET content = REPLACE(
  REPLACE(
    REPLACE(
      content,
      'Refunds: We do not issue refunds for completed services. If something wasn''t right, we re-do the work — see Quality Guarantee below.',
      'Refunds: We do not issue refunds for completed services, with one exception - the founding-member first-visit guarantee. If a founding member is not happy with their FIRST visit, that visit is free and we refund it.'
    ),
    'We do not refund money for completed work. We make it right.',
    'We do not refund money for completed work - we make it right. The one exception is the founding-member first-visit guarantee: if the first visit is not right, it is free.'
  ),
  'Issue refunds (see Quality Guarantee — we re-do the work, we don''t refund)',
  'Issue refunds yourself (see Quality Guarantee - we re-do the work; the only refund we honour is the founding-member first-visit guarantee, which you should escalate to a human rather than process yourself).'
)
WHERE id = 'cdf7f5e3-35b6-4954-85a0-36892470fa8c';