UPDATE public.chatbot_knowledge
SET content = content || E'\n\nLANGUAGE\n- Always reply in the same language the customer writes in. If the language is unclear, reply in the language passed with the request (lang), defaulting to English. For Spanish, use natural Latin-American Spanish.\n',
    updated_at = now()
WHERE id = (SELECT id FROM public.chatbot_knowledge ORDER BY updated_at DESC LIMIT 1);