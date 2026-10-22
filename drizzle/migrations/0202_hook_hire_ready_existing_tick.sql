DO $$
DECLARE definition text;
BEGIN
 definition := pg_get_functiondef('public.hiring_tick()'::regprocedure);
 IF position('PERFORM public.hire_ready_tick();' in definition)=0 THEN
 IF position('PERFORM public.hiring_seed_slots();' in definition)=0 THEN RAISE EXCEPTION 'Existing hiring tick hook not found'; END IF;
 definition := replace(definition,'PERFORM public.hiring_seed_slots();','PERFORM public.hiring_seed_slots();' || E'\n  PERFORM public.hire_ready_tick();');
 EXECUTE definition;
 END IF;
END $$;