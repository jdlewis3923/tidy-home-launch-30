UPDATE public.chatbot_knowledge
SET content = replace(
  replace(
    replace(
      replace(
        replace(
          content,
          'Never say we have launched, never cite how many customers we have or what most customers experience, and never promise a first-visit timeframe.',
          'Tidy has NOT launched yet. There are zero customers, zero completed visits and zero reviews. Never claim or imply that Tidy has launched, never cite customer numbers, ratings, reviews or testimonials, never state or imply a launch date, and never promise a first-visit timeframe.'
        ),
        '"We''re not in that ZIP yet — we''re starting in Pinecrest and Kendall."',
        '"We''re not in that ZIP yet — we''re opening in Pinecrest and parts of Kendall first."'
      ),
      'Do not promise a first-visit date. Tidy is still building its founding crew, so first visits are scheduled individually - tell the customer their visit date will be confirmed with them directly once their route is live.',
      'We''ll confirm your first visit date with you directly once your plan is set up. Do not promise a specific number of days.'
    ),
    'If a founding member is not happy with their FIRST visit, that visit is free and we refund it.',
    'If a founding member is not happy with their FIRST visit, that visit is free and we refund it. Do not refuse - acknowledge that the guarantee applies and escalate to a human at hello@jointidy.co to honour it.'
  ),
  'The one exception is the founding-member first-visit guarantee: if the first visit is not right, it is free.',
  'The one exception is the founding-member first-visit guarantee: if the first visit is not right, it is free. Do not refuse that request - acknowledge the guarantee applies and escalate to a human at hello@jointidy.co to honour it.'
)
WHERE id = 'cdf7f5e3-35b6-4954-85a0-36892470fa8c';