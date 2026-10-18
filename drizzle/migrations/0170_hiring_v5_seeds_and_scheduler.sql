-- Hiring v5 part 2: editable est_full_day_pay, archive reasons, question bank seed,
-- candidate FAQ seed, slot seeding, and the 15-minute deadline scheduler.

-- ============================================================ 17. launch_config: editable est_full_day_pay
CREATE OR REPLACE FUNCTION public.admin_set_launch_config(_scope text, _field text, _value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old text; n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _field NOT IN ('first_visit_date','conversion_date','pro_callback_date','pro_ready_by','late_first_visit_week','hanger_drops','est_full_day_pay') THEN
    RAISE EXCEPTION 'unknown_field';
  END IF;
  EXECUTE format('SELECT (%I)::text FROM public.launch_config WHERE scope = $1', _field) INTO old USING _scope;
  IF _field = 'hanger_drops' THEN
    UPDATE public.launch_config SET hanger_drops = _value::jsonb, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
  ELSIF _field = 'est_full_day_pay' THEN
    UPDATE public.launch_config SET est_full_day_pay = nullif(_value, '')::numeric, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
  ELSE
    EXECUTE format('UPDATE public.launch_config SET %I = $1::date, updated_at = now(), updated_by = $2 WHERE scope = $3', _field)
      USING nullif(_value, ''), auth.uid(), _scope;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'unknown_scope'; END IF;
  INSERT INTO public.launch_config_log (scope, field, old_value, new_value, changed_by) VALUES (_scope, _field, old, _value, auth.uid());
END $$;

-- Archive reason for the ghost report (no_apply, no_proof, no_booking, no_show_phone,
-- no_confirm, no_show_interview, no_sign, no_bg_consent, no_coi, knockout_apply).
ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS archive_reason text;

-- In-person meeting point: one fixed public location, set once by Justin. Never public.
INSERT INTO public.app_settings(key, value) VALUES ('hiring_inperson_location', '{"address":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================ 18. question bank seed
INSERT INTO public.question_bank (key, service, section, type, label_en, label_es, anchors_key, core, demo_able, weight, required, sort, options, correct_answer, knockout) VALUES
('about.first_name','all',1,'text','First name','Nombre',NULL,false,false,1,true,10,NULL,NULL,false),
('about.last_name','all',1,'text','Last name','Apellido',NULL,false,false,1,true,20,NULL,NULL,false),
('about.phone','all',1,'text','Mobile phone','Teléfono móvil',NULL,false,false,1,true,30,NULL,NULL,false),
('about.email','all',1,'text','Email','Correo electrónico',NULL,false,false,1,true,40,NULL,NULL,false),
('about.zip','all',1,'text','Home ZIP code','Código postal de tu casa',NULL,false,false,1,true,50,NULL,NULL,false),
('about.lang','all',1,'choice','Preferred language','Idioma preferido',NULL,false,false,1,true,60,'[{"value":"en","en":"English","es":"Inglés"},{"value":"es","en":"Spanish","es":"Español"}]',NULL,false),
('about.comfort_en','all',1,'slider','How comfortable are you speaking English?','¿Qué tan cómodo te sientes hablando inglés?','style',false,false,1,true,70,NULL,NULL,false),
('about.comfort_es','all',1,'slider','How comfortable are you speaking Spanish?','¿Qué tan cómodo te sientes hablando español?','style',false,false,1,true,80,NULL,NULL,false),
('about.source','all',1,'choice','How did you hear about us?','¿Cómo te enteraste de nosotros?',NULL,false,false,1,true,90,'[{"value":"indeed","en":"Indeed","es":"Indeed"},{"value":"friend","en":"A friend","es":"Un amigo"},{"value":"google","en":"Google","es":"Google"},{"value":"other","en":"Other","es":"Otro"}]',NULL,false),
('qual.equipment','all',2,'yesno','Do you own every item on the supply checklist for your service today?','¿Tienes hoy todos los artículos de la lista de equipo para tu servicio?',NULL,false,false,1,true,10,NULL,NULL,true),
('qual.vehicle','all',2,'yesno','Do you have a reliable vehicle that fits the equipment, a valid driver''s licence, and vehicle insurance?','¿Tienes un vehículo confiable donde quepa el equipo, licencia de conducir vigente y seguro del vehículo?',NULL,false,false,1,true,20,NULL,NULL,true),
('qual.authorized','all',2,'yesno','Are you authorized to work in the US?','¿Estás autorizado para trabajar en los EE. UU.?',NULL,false,false,1,true,30,NULL,NULL,true),
('qual.availability','all',2,'yesno','Can you work at least 2 full days Monday to Thursday, 8 AM to 4 PM?','¿Puedes trabajar al menos 2 días completos de lunes a jueves, de 8 AM a 4 PM?',NULL,false,false,1,true,40,NULL,NULL,true),
('qual.location','all',2,'yesno','Do you live within 30 minutes of Pinecrest or Kendall?','¿Vives a menos de 30 minutos de Pinecrest o Kendall?',NULL,false,false,1,true,50,NULL,NULL,true),
('qual.background','all',2,'yesno','Are you OK with a background check paid by Tidy?','¿Estás de acuerdo con una verificación de antecedentes pagada por Tidy?',NULL,false,false,1,true,60,NULL,NULL,true),
('qual.contractor','all',2,'yesno','Are you OK working as an independent (1099) contractor with your own liability insurance (~$25–60/mo; Tidy reimburses $50/mo for 3 months)?','¿Estás de acuerdo en trabajar como contratista independiente (1099) con tu propio seguro de responsabilidad (~$25–60/mes; Tidy reembolsa $50/mes por 3 meses)?',NULL,false,false,1,true,70,NULL,NULL,true),
('qual.ready','all',2,'yesno','Can you be fully ready by the date we give you?','¿Puedes estar completamente listo para la fecha que te indiquemos?',NULL,false,false,1,true,80,NULL,NULL,true),
('avail.grid','all',3,'grid','Which blocks can you work? (Mon–Fri, 8–12 and 12–4)','¿Qué horarios puedes trabajar? (lunes a viernes, 8–12 y 12–4)',NULL,false,false,1,true,10,NULL,NULL,false),
('avail.days_per_week','all',3,'choice','How many days per week do you want to work?','¿Cuántos días por semana quieres trabajar?',NULL,false,false,1,true,20,'[{"value":"2","en":"2 days","es":"2 días"},{"value":"3","en":"3 days","es":"3 días"},{"value":"4","en":"4 days","es":"4 días"}]',NULL,false),
('avail.income_goal','all',3,'number','Weekly income goal (US$)','Meta de ingresos semanales (US$)',NULL,false,false,1,true,30,NULL,NULL,false),
('avail.other_job','all',3,'yesno','Do you have another job right now?','¿Tienes otro trabajo actualmente?',NULL,false,false,1,true,40,NULL,NULL,false),
('avail.other_job_grid','all',3,'grid','Which days and hours is that job?','¿Qué días y horas es ese trabajo?',NULL,false,false,1,false,50,NULL,NULL,false),
('work.jobs','all',4,'grid','Your 3 most recent jobs (any field): title, company, start, end, what you did, why it ended, may we contact them?','Tus 3 trabajos más recientes (de cualquier tipo): puesto, empresa, inicio, fin, qué hacías, por qué terminó, ¿podemos contactarlos?',NULL,false,false,1,true,10,NULL,NULL,false),
('work.paid_years','all',4,'choice','Years of PAID experience doing this service','Años de experiencia PAGADA haciendo este servicio',NULL,false,false,1,true,20,'[{"value":"0","en":"None","es":"Ninguna"},{"value":"<1","en":"Less than 1 year","es":"Menos de 1 año"},{"value":"1-2","en":"1–2 years","es":"1–2 años"},{"value":"3-5","en":"3–5 years","es":"3–5 años"},{"value":"5+","en":"5+ years","es":"Más de 5 años"}]',NULL,false),
('work.unpaid','all',4,'text','Unpaid experience (optional)','Experiencia no pagada (opcional)',NULL,false,false,1,false,30,NULL,NULL,false),
('style.on_time','all',6,'slider','I show up on time, every time','Llego a tiempo, siempre','style',false,false,1,true,10,NULL,NULL,false),
('style.reply_texts','all',6,'slider','I reply to texts within an hour during work days','Respondo mensajes en menos de una hora en días de trabajo','style',false,false,1,true,20,NULL,NULL,false),
('style.work_alone','all',6,'slider','I work well alone with nobody checking on me','Trabajo bien solo sin que nadie me supervise','style',false,false,1,true,30,NULL,NULL,false),
('style.checklist','all',6,'slider','I follow a checklist exactly, even the boring parts','Sigo una lista de pasos al pie de la letra, hasta las partes aburridas','style',false,false,1,true,40,NULL,NULL,false),
('style.homeowners','all',6,'slider','I''m comfortable talking with homeowners','Me siento cómodo hablando con los dueños de casa','style',false,false,1,true,50,NULL,NULL,false),
('style.calm_unhappy','all',6,'slider','I stay calm when a customer is unhappy','Me mantengo calmado cuando un cliente no está contento','style',false,false,1,true,60,NULL,NULL,false),
('style.heat','all',6,'slider','I can work a full day on my feet in Miami heat','Puedo trabajar un día completo de pie bajo el calor de Miami','style',false,false,1,true,70,NULL,NULL,false),
('style.pets','all',6,'slider','I''m comfortable with big dogs and other pets','Me siento cómodo con perros grandes y otras mascotas','style',false,false,1,true,80,NULL,NULL,false),
('style.app_photos','all',6,'slider','I''m comfortable using an app for photos and checklists','Me siento cómodo usando una app para fotos y listas de pasos','style',false,false,1,true,90,NULL,NULL,false),
('style.equipment_clean','all',6,'slider','I keep my equipment clean and working','Mantengo mi equipo limpio y funcionando','style',false,false,1,true,100,NULL,NULL,false),
('attend.late_3m','all',7,'number','How many times were you late to work in the last 3 months?','¿Cuántas veces llegaste tarde al trabajo en los últimos 3 meses?',NULL,false,false,1,true,10,NULL,NULL,false),
('attend.missed_12m','all',7,'number','How many days did you miss in the last 12 months (not counting approved time off)?','¿Cuántos días faltaste en los últimos 12 meses (sin contar días libres aprobados)?',NULL,false,false,1,true,20,NULL,NULL,false),
('attend.jobs_24m','all',7,'number','How many jobs have you held in the last 24 months?','¿Cuántos trabajos has tenido en los últimos 24 meses?',NULL,false,false,1,true,30,NULL,NULL,false),
('attend.late_response','all',7,'choice','If you were running 20 minutes late, what would you do?','Si fueras a llegar 20 minutos tarde, ¿qué harías?',NULL,false,false,1,true,40,'[{"value":"call_before","en":"Call or text before the start time","es":"Llamar o escribir antes de la hora de inicio"},{"value":"text_on_arrival","en":"Text when I arrive","es":"Escribir cuando llegue"},{"value":"nothing","en":"Nothing if it''s only 20 minutes","es":"Nada si solo son 20 minutos"}]','call_before',false),
('scen.s1','all',8,'choice','Your car won''t start at 7 AM for an 8 AM visit. What do you do?','Tu carro no enciende a las 7 AM para una visita a las 8 AM. ¿Qué haces?',NULL,false,false,1,true,10,'[{"value":"call_tidy","en":"Call Tidy right away and arrange another way","es":"Llamar a Tidy de inmediato y buscar otra forma de llegar"},{"value":"text_later","en":"Text the member later","es":"Escribirle al cliente más tarde"},{"value":"skip_reschedule","en":"Skip it and reschedule yourself","es":"Saltarla y reprogramarla por tu cuenta"}]','call_tidy',false),
('scen.s2','all',8,'choice','You break a decorative item at a member''s home. What do you do?','Rompes un artículo decorativo en la casa de un cliente. ¿Qué haces?',NULL,false,false,1,true,20,'[{"value":"tell_photo","en":"Tell the member and Tidy right away, with a photo","es":"Avisar al cliente y a Tidy de inmediato, con una foto"},{"value":"replace_quietly","en":"Replace it quietly","es":"Reemplazarlo sin decir nada"},{"value":"dont_mention","en":"Don''t mention it","es":"No decir nada"}]','tell_photo',false),
('scen.s3','all',8,'choice','A member offers you cash for extra work off the books. What do you do?','Un cliente te ofrece efectivo por trabajo extra por fuera de Tidy. ¿Qué haces?',NULL,false,false,1,true,30,'[{"value":"decline_tell","en":"Say no and tell Tidy, or book it as an add-on","es":"Decir que no y avisar a Tidy, o agendarlo como un extra"},{"value":"accept","en":"Accept — it''s your time","es":"Aceptar — es tu tiempo"},{"value":"accept_once","en":"Accept just this once","es":"Aceptar solo esta vez"}]','decline_tell',false),
('scen.s4','all',8,'choice','Nobody''s home and you can''t get in. What do you do?','No hay nadie en casa y no puedes entrar. ¿Qué haces?',NULL,false,false,1,true,40,'[{"value":"contact_wait","en":"Text or call Tidy, wait 15 minutes, follow instructions","es":"Escribir o llamar a Tidy, esperar 15 minutos y seguir las instrucciones"},{"value":"leave","en":"Leave immediately","es":"Irte de inmediato"},{"value":"try_window","en":"Try a window or side door","es":"Intentar por una ventana o puerta lateral"}]','contact_wait',false),
('scen.s5','all',8,'choice','A dog is loose in the yard or the house. What do you do?','Hay un perro suelto en el patio o en la casa. ¿Qué haces?',NULL,false,false,1,true,50,'[{"value":"dont_enter","en":"Don''t enter; contact Tidy or the member","es":"No entrar; contactar a Tidy o al cliente"},{"value":"work_around","en":"Work around it","es":"Trabajar alrededor del perro"},{"value":"let_out","en":"Let it out","es":"Dejarlo salir"}]','dont_enter',false),
('scen.s6','all',8,'choice','The job will take 45 minutes longer than planned. What do you do?','El trabajo tomará 45 minutos más de lo planeado. ¿Qué haces?',NULL,false,false,1,true,60,'[{"value":"tell_before_over","en":"Tell Tidy before going over and suggest an add-on or size change","es":"Avisar a Tidy antes de pasarte y sugerir un extra o un cambio de tamaño"},{"value":"stay_quiet","en":"Stay late without saying anything","es":"Quedarte hasta tarde sin avisar"},{"value":"rush_skip","en":"Rush and skip the rest","es":"Apurarte y saltarte el resto"}]','tell_before_over',false),
('equip.checklist','cleaning',9,'checklist','Your cleaning equipment: tick each item you own, with brand and approximate age','Tu equipo de limpieza: marca cada artículo que tienes, con la marca y la antigüedad aproximada',NULL,false,false,1,true,10,NULL,NULL,true),
('equip.checklist','lawn',9,'checklist','Your lawn equipment: tick each item you own, with brand and approximate age','Tu equipo de jardinería: marca cada artículo que tienes, con la marca y la antigüedad aproximada',NULL,false,false,1,true,10,NULL,NULL,true),
('equip.checklist','car_care',9,'checklist','Your car care equipment: tick each item you own, with brand and approximate age','Tu equipo de cuidado de autos: marca cada artículo que tienes, con la marca y la antigüedad aproximada',NULL,false,false,1,true,10,NULL,NULL,true),
('intent.motivation','all',10,'choice','What do you want most?','¿Qué es lo que más quieres?',NULL,false,false,1,true,10,'[{"value":"steady_route","en":"A steady weekly route","es":"Una ruta semanal fija"},{"value":"build_business","en":"To build my own business","es":"Construir mi propio negocio"},{"value":"extra_income","en":"Extra income on the side","es":"Ingresos extra aparte"},{"value":"flexible","en":"Something flexible for now","es":"Algo flexible por ahora"}]',NULL,false),
('intent.why_tidy','all',10,'text','Why Tidy? (1–2 sentences)','¿Por qué Tidy? (1–2 oraciones)',NULL,false,false,1,true,20,NULL,NULL,false),
('intent.other_apps','all',10,'choice','How many other job applications do you have in progress?','¿Cuántas solicitudes de empleo más tienes en proceso?',NULL,false,false,1,true,30,'[{"value":"0","en":"0","es":"0"},{"value":"1-2","en":"1–2","es":"1–2"},{"value":"3+","en":"3 or more","es":"3 o más"}]',NULL,false),
('intent.earliest_start','all',10,'date','Earliest date you could start','Fecha más pronto en que podrías empezar',NULL,false,false,1,true,40,NULL,NULL,false),
('intent.blockers','all',10,'text','What could stop you from being ready by the date we give you?','¿Qué podría impedirte estar listo para la fecha que te indiquemos?',NULL,false,false,1,true,50,NULL,NULL,false),
('intent.one_year','all',10,'text','Where do you want to be in a year? (optional)','¿Dónde quieres estar en un año? (opcional)',NULL,false,false,1,false,60,NULL,NULL,false),
('ref.name','all',11,'text','Work reference: name (past boss or client — not family or a friend)','Referencia de trabajo: nombre (un jefe o cliente anterior — no familia ni amigos)',NULL,false,false,1,true,10,NULL,NULL,false),
('ref.phone','all',11,'text','Reference phone','Teléfono de la referencia',NULL,false,false,1,true,20,NULL,NULL,false),
('ref.relationship','all',11,'text','Relationship (how do they know you?)','Relación (¿cómo te conocen?)',NULL,false,false,1,true,30,NULL,NULL,false),
('ref.years','all',11,'text','How long have they known you?','¿Hace cuánto tiempo te conocen?',NULL,false,false,1,true,40,NULL,NULL,false),
('review.truthful','all',12,'yesno','Everything here is true','Todo lo que escribí es verdad',NULL,false,false,1,true,10,NULL,NULL,false),
('review.sms_consent','all',12,'yesno','Tidy may text me about my application. Msg & data rates may apply. Reply STOP to opt out.','Tidy puede escribirme por texto sobre mi solicitud. Pueden aplicar cargos por mensajes y datos. Responde STOP para dejar de recibirlos.',NULL,false,false,1,true,20,NULL,NULL,false)
ON CONFLICT (key) DO NOTHING;

-- 5 Skills — cleaning
INSERT INTO public.question_bank (key, service, section, type, label_en, label_es, anchors_key, core, demo_able, weight, required, sort) VALUES
('skill.kitchen','cleaning',5,'slider','Kitchen counters, sink and stovetop','Encimeras de cocina, fregadero y estufa','skill',true,true,1,true,10),
('skill.bathrooms','cleaning',5,'slider','Bathrooms (toilet, tub/shower, soap scum, mirrors)','Baños (inodoro, tina/ducha, residuos de jabón, espejos)','skill',true,true,1,true,20),
('skill.dusting','cleaning',5,'slider','Dusting high and low','Limpiar el polvo en lugares altos y bajos','skill',true,true,1,true,30),
('skill.floors','cleaning',5,'slider','Floors (tile, hardwood, mopping without streaks)','Pisos (loseta, madera, trapear sin dejar marcas)','skill',true,true,1,true,40),
('skill.vacuuming','cleaning',5,'slider','Vacuuming (carpet, stairs, edges)','Aspirar (alfombra, escaleras, bordes)','skill',true,true,1,true,50),
('skill.tidying_beds','cleaning',5,'slider','Tidying and making beds','Ordenar y tender camas','skill',true,false,1,true,60),
('skill.speed_3br','cleaning',5,'slider','Finishing a 3-bedroom home in about 3 hours','Terminar una casa de 3 habitaciones en unas 3 horas','skill',true,false,1,true,70),
('skill.products','cleaning',5,'slider','Knowing which product goes on which surface (and never mixing chemicals)','Saber qué producto va en cada superficie (y nunca mezclar químicos)','skill',true,false,1,true,80),
('skill.oven','cleaning',5,'slider','Inside oven','Interior del horno','skill',false,true,1,true,90),
('skill.fridge','cleaning',5,'slider','Inside fridge','Interior del refrigerador','skill',false,false,1,true,100),
('skill.windows_int','cleaning',5,'slider','Interior windows','Ventanas interiores','skill',false,true,1,true,110),
('skill.baseboards','cleaning',5,'slider','Deep baseboards','Zócalos a fondo','skill',false,true,1,true,120),
('skill.cabinets','cleaning',5,'slider','Inside kitchen cabinets','Interior de los gabinetes de cocina','skill',false,false,1,true,130)
ON CONFLICT (key) DO NOTHING;

-- 5 Skills — lawn
INSERT INTO public.question_bank (key, service, section, type, label_en, label_es, anchors_key, core, demo_able, weight, required, sort) VALUES
('skill.mowing','lawn',5,'slider','Mowing (even height, clean lines)','Cortar el césped (altura pareja, líneas limpias)','skill',true,true,1,true,10),
('skill.trimming','lawn',5,'slider','String trimming','Recortar con guaya','skill',true,true,1,true,20),
('skill.edging','lawn',5,'slider','Edging sidewalks and driveways','Perfilar aceras y entradas','skill',true,true,1,true,30),
('skill.blowing','lawn',5,'slider','Blowing and cleanup','Soplar y limpiar','skill',true,true,1,true,40),
('skill.st_augustine','lawn',5,'slider','St. Augustine and Miami grasses (cut height, when not to mow)','Céspedes St. Augustine y de Miami (altura de corte, cuándo no cortar)','skill',true,false,1,true,50),
('skill.equipment_upkeep','lawn',5,'slider','Equipment upkeep (blades, line, oil, fuel)','Mantenimiento del equipo (cuchillas, guaya, aceite, combustible)','skill',true,true,1,true,60),
('skill.safety','lawn',5,'slider','Safety around pools, kids, pets and windows','Seguridad cerca de piscinas, niños, mascotas y ventanas','skill',true,false,1,true,70),
('skill.weeds','lawn',5,'slider','Weed removal in beds','Quitar malezas en los canteros','skill',false,false,1,true,80),
('skill.leaves','lawn',5,'slider','Leaf and debris cleanup','Limpieza de hojas y escombros','skill',false,false,1,true,90),
('skill.bed_edge','lawn',5,'slider','Bed edge reset','Reperfilar bordes de canteros','skill',false,true,1,true,100),
('skill.windows_ext','lawn',5,'slider','Exterior windows and screens','Ventanas y mallas exteriores','skill',false,false,1,true,110),
('skill.pressure_wash','lawn',5,'slider','Driveway pressure washing','Lavado a presión de entradas','skill',false,true,1,true,120)
ON CONFLICT (key) DO NOTHING;

-- 5 Skills — car care
INSERT INTO public.question_bank (key, service, section, type, label_en, label_es, anchors_key, core, demo_able, weight, required, sort) VALUES
('skill.hand_wash','car_care',5,'slider','Exterior hand wash without scratching (two-bucket or rinseless)','Lavado exterior a mano sin rayar (dos cubetas o sin enjuague)','skill',true,true,1,true,10),
('skill.wheels','car_care',5,'slider','Wheels and tires','Rines y llantas','skill',true,true,1,true,20),
('skill.interior_vacuum','car_care',5,'slider','Interior vacuum and wipe-down','Aspirado y limpieza del interior','skill',true,true,1,true,30),
('skill.glass','car_care',5,'slider','Glass, streak-free','Vidrios sin marcas','skill',true,true,1,true,40),
('skill.mobile_setup','car_care',5,'slider','Mobile setup (water, power, working in a driveway)','Trabajo móvil (agua, electricidad, trabajar en una entrada)','skill',true,false,1,true,50),
('skill.paint_safety','car_care',5,'slider','Paint safety (avoiding swirls and water spots)','Cuidado de la pintura (evitar remolinos y manchas de agua)','skill',true,false,1,true,60),
('skill.pet_hair','car_care',5,'slider','Pet hair removal','Quitar pelo de mascotas','skill',false,true,1,true,70),
('skill.interior_protect','car_care',5,'slider','Interior protect and condition','Proteger y acondicionar el interior','skill',false,false,1,true,80),
('skill.headlights','car_care',5,'slider','Headlight restoration','Restauración de faros','skill',false,true,1,true,90),
('skill.clay_bar','car_care',5,'slider','Clay bar','Barra de arcilla','skill',false,false,1,true,100),
('skill.ceramic','car_care',5,'slider','Ceramic coating','Recubrimiento cerámico','skill',false,false,1,true,110),
('skill.machine_polish','car_care',5,'slider','Machine polishing','Pulido a máquina','skill',false,true,1,true,120)
ON CONFLICT (key) DO NOTHING;

-- ============================================================ 19. candidate FAQ seed
INSERT INTO public.candidate_faq (q_en, a_en, q_es, a_es, sort, candidate_visible, needs_justin) VALUES
('How much do I make?','Per completed visit. Cleaning $56 / $76 / $112 by home size. Lawn $18 / $26 / $40 by lawn size. Car care $16 / $20 / $26 per wash and $78 / $88 / $115 per full detail. Add-ons pay 40% of their price. A full cleaning day is 3 homes.','¿Cuánto gano?','Por visita completada. Limpieza $56 / $76 / $112 según el tamaño de la casa. Césped $18 / $26 / $40 según el tamaño. Cuidado de autos $16 / $20 / $26 por lavado y $78 / $88 / $115 por detalle completo. Los extras pagan 40% de su precio. Un día completo de limpieza son 3 casas.',10,true,false),
('When and how do I get paid?','','¿Cuándo y cómo me pagan?','',20,true,true),
('How many visits will I get?','The route builds from launch day as members join. The first weeks are lighter. A full cleaning route is about 25 homes.','¿Cuántas visitas tendré?','La ruta crece desde el día de lanzamiento a medida que se unen los clientes. Las primeras semanas son más ligeras. Una ruta completa de limpieza son unas 25 casas.',30,true,false),
('What days do I work?','You choose your full days Monday to Thursday. Fridays are catch-up days (rain-outs), and you can book your own work on Fridays with 24 h notice.','¿Qué días trabajo?','Tú eliges tus días completos de lunes a jueves. Los viernes son días de recuperación (por lluvia), y puedes agendar tu propio trabajo los viernes con 24 h de aviso.',40,true,false),
('Who pays for equipment and supplies?','You do. It''s your business. The supply checklist is on page 2 of your one-pager. Tidy provides the uniform kit and photo ID badge.','¿Quién paga el equipo y los suministros?','Tú. Es tu negocio. La lista de equipo está en la página 2 de tu hoja de información. Tidy proporciona el kit de uniforme y la credencial con foto.',50,true,false),
('Do I need insurance?','Yes, before your first paid visit: general liability $1M per occurrence / $2M aggregate, naming Tidy as Additional Insured. Usually $25–60 a month. Tidy reimburses $50 a month for your first 3 months.','¿Necesito seguro?','Sí, antes de tu primera visita pagada: responsabilidad general de $1M por incidente / $2M total, nombrando a Tidy como Asegurado Adicional. Normalmente $25–60 al mes. Tidy te reembolsa $50 al mes durante tus primeros 3 meses.',60,true,false),
('Do I need an LLC?','No.','¿Necesito una LLC?','No.',70,true,false),
('Am I an employee?','No. You''re an independent contractor (1099). You decide how you do the work. Tidy sets the visit, the time window and the standard members expect.','¿Soy un empleado?','No. Eres un contratista independiente (1099). Tú decides cómo haces el trabajo. Tidy define la visita, el horario y el estándar que los clientes esperan.',80,true,false),
('Who pays for the background check?','Tidy. It checks criminal and driving records and takes 1–5 days.','¿Quién paga la verificación de antecedentes?','Tidy. Revisa antecedentes penales y de manejo y toma de 1 a 5 días.',90,true,false),
('Can I keep my own clients?','Yes. Tidy members are always booked through Tidy.','¿Puedo mantener mis propios clientes?','Sí. Los clientes de Tidy siempre se agendan a través de Tidy.',100,true,false),
('Can I bring a helper?','No. Only Tidy-checked Pros go into members'' homes.','¿Puedo llevar un ayudante?','No. Solo los Pros verificados por Tidy entran a las casas de los clientes.',110,true,false),
('Are there bonuses?','Tier 2 Pro Partner: +10% on everything after 50+ visits, a 4.8+ rating and 60+ days. Plus $25 for every five-star Google review that names you.','¿Hay bonos?','Pro Partner Nivel 2: +10% en todo después de 50+ visitas, una calificación de 4.8+ y 60+ días. Además, $25 por cada reseña de Google de cinco estrellas que te mencione.',120,true,false),
('What if a member isn''t happy?','We come back within 48 hours to fix it. You''re paid 50% of the visit rate for the redo.','¿Qué pasa si un cliente no queda contento?','Regresamos en 48 horas a corregirlo. Se te paga el 50% de la tarifa de la visita por la corrección.',130,true,false),
('When do I start?','First visits are {launch}. You need to be fully ready by {pro_ready_by}.','¿Cuándo empiezo?','Las primeras visitas son el {launch}. Debes estar completamente listo para el {pro_ready_by}.',140,true,false)
ON CONFLICT DO NOTHING;

-- ============================================================ 20. slot seeding
-- Phone: Mon–Fri 6:00–8:30 PM ET and Sat 9:00–11:30 AM ET, every 30 min, next 5 days.
-- In-person: Saturdays 10:00 AM–3:00 PM ET, hourly, next 4 Saturdays.
CREATE OR REPLACE FUNCTION public.hiring_seed_slots() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; t time; n int := 0; et timestamp;
BEGIN
  FOR d IN SELECT generate_series((now() AT TIME ZONE 'America/New_York')::date, (now() AT TIME ZONE 'America/New_York')::date + 5, '1 day'::interval)::date LOOP
    IF extract(isodow FROM d) BETWEEN 1 AND 5 THEN
      FOR t IN SELECT generate_series(time '18:00', time '20:00', '30 minutes'::interval) LOOP
        et := (d || ' ' || t)::timestamp;
        INSERT INTO public.hiring_slots(kind, starts_at, duration_min, staff)
        SELECT 'phone', (et AT TIME ZONE 'America/New_York'), 30, 'Screener'
        WHERE NOT EXISTS (SELECT 1 FROM public.hiring_slots s WHERE s.kind = 'phone' AND s.starts_at = (et AT TIME ZONE 'America/New_York'));
        n := n + 1;
      END LOOP;
    ELSIF extract(isodow FROM d) = 6 THEN
      FOR t IN SELECT generate_series(time '09:00', time '11:00', '30 minutes'::interval) LOOP
        et := (d || ' ' || t)::timestamp;
        INSERT INTO public.hiring_slots(kind, starts_at, duration_min, staff)
        SELECT 'phone', (et AT TIME ZONE 'America/New_York'), 30, 'Screener'
        WHERE NOT EXISTS (SELECT 1 FROM public.hiring_slots s WHERE s.kind = 'phone' AND s.starts_at = (et AT TIME ZONE 'America/New_York'));
        n := n + 1;
      END LOOP;
    END IF;
  END LOOP;
  FOR d IN SELECT generate_series((now() AT TIME ZONE 'America/New_York')::date, (now() AT TIME ZONE 'America/New_York')::date + 28, '1 day'::interval)::date LOOP
    IF extract(isodow FROM d) = 6 THEN
      FOR t IN SELECT generate_series(time '10:00', time '14:00', '1 hour'::interval) LOOP
        et := (d || ' ' || t)::timestamp;
        INSERT INTO public.hiring_slots(kind, starts_at, duration_min, staff)
        SELECT 'in_person', (et AT TIME ZONE 'America/New_York'), 60, 'Justin'
        WHERE NOT EXISTS (SELECT 1 FROM public.hiring_slots s WHERE s.kind = 'in_person' AND s.starts_at = (et AT TIME ZONE 'America/New_York'));
        n := n + 1;
      END LOOP;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- ============================================================ 21. the 15-minute scheduler
-- Deadlines, one nudge each, auto-archive with the right reason, slot reminders,
-- CONFIRM window, weekly check-ins. Quiet hours via the existing safe_send_time guard
-- inside send-twilio-sms (texts queue outside the window, never drop).
CREATE OR REPLACE FUNCTION public.hiring_tick() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; dow int; et_now timestamp;
BEGIN
  PERFORM public.hiring_seed_slots();
  et_now := now() AT TIME ZONE 'America/New_York';
  dow := extract(isodow FROM et_now::date)::int;

  -- 1. Nudges (max 1 per deadline)
  FOR r IN SELECT d.id, d.applicant_id, d.kind FROM public.hiring_deadlines d
     JOIN public.contractor_pipeline p ON p.applicant_id = d.applicant_id
    WHERE d.resolved_at IS NULL AND d.nudged_at IS NULL AND d.nudge_at IS NOT NULL AND d.nudge_at <= now()
      AND NOT p.archived AND NOT p.is_test
  LOOP
    UPDATE public.hiring_deadlines SET nudged_at = now() WHERE id = r.id;
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'nudge', 'step', r.kind));
    n := n + 1;
  END LOOP;

  -- 2. Misses → archive with the reason + close-out text
  FOR r IN SELECT d.id, d.applicant_id, d.kind FROM public.hiring_deadlines d
     JOIN public.contractor_pipeline p ON p.applicant_id = d.applicant_id
    WHERE d.resolved_at IS NULL AND d.due_at <= now() AND NOT p.archived AND NOT p.is_test
  LOOP
    UPDATE public.hiring_deadlines SET resolved_at = now() WHERE id = r.id;
    PERFORM set_config('tidy.pipeline_move', 'on', true);
    UPDATE public.contractor_pipeline SET archived = true, archived_at = now(), state = 'declined',
      archive_reason = CASE r.kind
        WHEN 'apply' THEN 'no_apply' WHEN 'proof' THEN 'no_proof' WHEN 'book_phone' THEN 'no_booking'
        WHEN 'phone_slot' THEN 'no_show_phone' WHEN 'confirm_inperson' THEN 'no_confirm'
        WHEN 'inperson_slot' THEN 'no_show_interview' WHEN 'sign' THEN 'no_sign'
        WHEN 'checkr_consent' THEN 'no_bg_consent' WHEN 'coi' THEN 'no_coi' ELSE r.kind END,
      decline_reason = 'Unresponsive'
     WHERE applicant_id = r.applicant_id;
    PERFORM public.pipeline_log(r.applicant_id, 'decline', NULL, NULL, 'open', 'declined', 'silence: ' || r.kind, jsonb_build_object('archive_reason', r.kind));
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'close_out'));
    n := n + 1;
  END LOOP;

  -- 3. Slot reminders: phone 24 h + 2 h before; in-person 24 h + morning of (8 AM ET)
  FOR r IN SELECT s.id, s.applicant_id, s.kind, s.starts_at FROM public.hiring_slots s
     JOIN public.contractor_pipeline p ON p.applicant_id = s.applicant_id
    WHERE s.status = 'booked' AND s.applicant_id IS NOT NULL AND NOT p.archived AND NOT p.is_test
      AND s.starts_at > now()
  LOOP
    IF r.starts_at - now() <= interval '24 hours' AND r.starts_at - now() > interval '23 hours' THEN
      PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'slot_reminder', 'slot', r.id));
      n := n + 1;
    ELSIF r.kind = 'phone' AND r.starts_at - now() <= interval '2 hours' AND r.starts_at - now() > interval '1 hour' THEN
      PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'slot_reminder', 'slot', r.id));
      n := n + 1;
    ELSIF r.kind = 'in_person' AND (et_now::time BETWEEN time '08:00' AND time '08:15')
       AND r.starts_at::date = et_now::date THEN
      PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'slot_reminder', 'slot', r.id));
      n := n + 1;
    END IF;
  END LOOP;

  -- 4. Weekly check-in: Mondays 6 PM ET, stages agreement/background/insured (signed, not yet active)
  IF dow = 1 AND et_now::time BETWEEN time '18:00' AND time '18:15' THEN
    FOR r IN SELECT p.applicant_id FROM public.contractor_pipeline p
       WHERE p.stage IN ('agreement','background','insured') AND NOT p.archived AND NOT p.is_test AND p.state = 'open'
         AND (p.last_checkin_sent_at IS NULL OR p.last_checkin_sent_at < now() - interval '6 days')
    LOOP
      UPDATE public.contractor_pipeline SET last_checkin_sent_at = now() WHERE applicant_id = r.applicant_id;
      PERFORM public.hiring_set_deadline(r.applicant_id, 'checkin', now() + interval '24 hours', NULL);
      PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'weekly_checkin'));
      n := n + 1;
    END LOOP;
  END IF;

  -- 5. Check-in no reply in 24 h → URGENT; two misses → URGENT + bench note
  FOR r IN SELECT d.applicant_id FROM public.hiring_deadlines d
     JOIN public.contractor_pipeline p ON p.applicant_id = d.applicant_id
    WHERE d.kind = 'checkin' AND d.resolved_at IS NULL AND d.due_at <= now() AND NOT p.archived AND NOT p.is_test
  LOOP
    UPDATE public.hiring_deadlines SET resolved_at = now() WHERE applicant_id = r.applicant_id AND kind = 'checkin' AND resolved_at IS NULL;
    UPDATE public.contractor_pipeline SET checkin_missed_count = checkin_missed_count + 1 WHERE applicant_id = r.applicant_id;
    INSERT INTO public.admin_alerts(alert_type, level, category, title, body, action_label, action_url, dedupe_key, context)
    SELECT 'hiring_checkin_missed', 'urgent', 'hiring',
      'Call ' || trim(coalesce(a.first_name,'')) || ' today',
      CASE WHEN p.checkin_missed_count + 1 >= 2
        THEN 'Two weekly check-ins missed. Consider offering the seat to bench #2 for this service (spend lock override reason: "seat lead silent").'
        ELSE 'No reply to the weekly check-in within 24 hours.' END,
      'Open candidate', '/admin/pipeline/' || r.applicant_id,
      'checkin_missed:' || r.applicant_id || ':' || (p.checkin_missed_count + 1),
      jsonb_build_object('applicant_id', r.applicant_id, 'missed', p.checkin_missed_count + 1)
    FROM public.applicants a, public.contractor_pipeline p
    WHERE a.id = r.applicant_id AND p.applicant_id = r.applicant_id
    ON CONFLICT (dedupe_key) DO NOTHING;
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;