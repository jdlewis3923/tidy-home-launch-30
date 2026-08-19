UPDATE public.chatbot_knowledge SET content = replace(content, 'Founding members get an extra $50 off their first month.', 'Founding members lock in their founding rate: that price never rises for as long as they stay a member. They also get one free premium add-on on the first visit, a guarantee that if the first visit is not perfect it is free, and founding spots are capped at 25 homes per ZIP.') WHERE content LIKE '%Founding members get an extra $50 off their first month.%';

UPDATE public.kpi_definitions SET name = 'Founding Signup %' WHERE name = 'TIDY50 Redemption %';

UPDATE public.kpi_definitions SET name = 'Founding Offer Spend % of MRR' WHERE name = 'TIDY50 Spend % of MRR';

UPDATE public.kpi_definitions SET playbook = replace(playbook::text, 'Verify TIDY50 banner on /signup + LPs', 'Verify founding banner on /signup + LPs')::jsonb WHERE playbook::text LIKE '%Verify TIDY50 banner%';

UPDATE public.kpi_definitions SET playbook = replace(playbook::text, 'Extend TIDY50 promo', 'Review founding offer')::jsonb WHERE playbook::text LIKE '%Extend TIDY50 promo%';