-- Owner-approved wording only. Preserve accepted scope versions; no notification writes.
BEGIN;
WITH retired AS (
  UPDATE public.service_scope SET active=false
  WHERE active AND service IN ('cleaning','cleaning_deep_clean','car_wash','car_detail')
    AND EXISTS (SELECT 1 FROM public.service_scope s WHERE s.active AND s.service IN ('car_wash','car_detail') AND s.notice_key='water' AND s.text_en LIKE 'Your Pro may use%')
  RETURNING *
), next_versions AS (
  SELECT service,max(scope_version)+1 AS version FROM public.service_scope
  WHERE service IN ('cleaning','cleaning_deep_clean','car_wash','car_detail') GROUP BY service
)
INSERT INTO public.service_scope(service,section,text_en,text_es,addon_key,sort_order,scope_version,active,group_en,group_es,notice_key)
SELECT r.service,r.section,
 CASE
  WHEN r.notice_key='water' THEN 'By booking, your Pro will use your home''s outdoor water spigot and electrical outlet when present. Choose No only if your home genuinely has none. Your Pro brings water for homes without a spigot.'
  WHEN r.section='customer_must' AND r.service IN ('car_wash','car_detail') AND r.text_en ILIKE '%spigot%' THEN 'Keep your home''s outdoor water spigot and electrical outlet accessible for your Pro when present.'
  WHEN r.section='customer_must' AND r.service IN ('cleaning','cleaning_deep_clean') AND r.text_en ILIKE '%water and electricity%' THEN 'Water and electricity must be on and accessible: your Pro uses your home''s water and electricity during each visit as a condition of booking.'
  ELSE r.text_en END,
 CASE
  WHEN r.notice_key='water' THEN 'Al reservar, tu Pro usará la llave de agua exterior y el tomacorriente exterior de tu casa si los tiene. Elige No solo si tu casa realmente no los tiene. Tu Pro trae agua para las casas sin llave de agua exterior.'
  WHEN r.section='customer_must' AND r.service IN ('car_wash','car_detail') AND r.text_en ILIKE '%spigot%' THEN 'Mantén accesibles la llave de agua exterior y el tomacorriente exterior de tu casa para tu Pro si los tienes.'
  WHEN r.section='customer_must' AND r.service IN ('cleaning','cleaning_deep_clean') AND r.text_en ILIKE '%water and electricity%' THEN 'El agua y la electricidad deben estar disponibles y accesibles: tu Pro usa el agua y la electricidad de tu casa durante cada visita como condición de la reserva.'
  ELSE r.text_es END,
 r.addon_key,r.sort_order,v.version,true,r.group_en,r.group_es,r.notice_key
FROM retired r JOIN next_versions v USING(service);

UPDATE public.chatbot_knowledge SET content =
 replace(replace(content,
 'We come to the customer''s home with water, power and supplies on a self-contained truck.',
 'Water and electricity use is a condition of booking. For Car Care and the Car Wash Add-On, the Pro uses the home''s outdoor spigot and electrical outlet when present. For homes genuinely without a spigot, the Pro brings water.'),
 'No water tank is needed — every car customer confirms an outdoor spigot and outdoor outlet at booking. If one is missing on arrival, note it in the Pro app and call the office; never improvise.',
 'At booking, customers report whether their home genuinely has an outdoor spigot and outlet. The Pro uses them when present; No is not a choice to withhold access. For homes without a spigot, the Pro brings water. If a member reports No despite having a spigot or outlet, or blocks access, record it in the Visit Report and Tidy contacts the member; the visit still counts.') || E'\n\nWATER AND ELECTRICITY — CONDITION OF BOOKING (EN/ES)\nHouse cleaning uses the home''s water and electricity each visit. Car Care and the Car Wash Add-On use the home''s outdoor spigot and electrical outlet when present. No means genuinely absent, not withheld permission. Misreporting or blocking access is recorded in the Visit Report, Tidy contacts the member, and the visit still counts.\nEl uso del agua y la electricidad es una condición de la reserva. La limpieza del hogar usa el agua y la electricidad de la casa en cada visita. Cuidado del Auto y el lavado adicional usan la llave de agua exterior y el tomacorriente exterior si la casa los tiene. No significa que realmente no existen, no que se niega permiso. Si el miembro indica No aunque los tiene, o bloquea el acceso, el Pro lo registra en el Reporte de Visita, Tidy contacta al miembro y la visita sigue contando.\n', updated_at=now()
WHERE id=(SELECT id FROM public.chatbot_knowledge ORDER BY updated_at DESC LIMIT 1)
 AND content NOT LIKE '%WATER AND ELECTRICITY — CONDITION OF BOOKING (EN/ES)%';
COMMIT;
