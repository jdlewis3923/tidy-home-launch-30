CREATE OR REPLACE FUNCTION public.cleaning_apply_verified_quote(_reservation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reservations; updated_lines jsonb; total integer;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=_reservation FOR UPDATE;
 IF r.cleaning_verified_size NOT IN ('1','2','3','4','5') OR r.cleaning_new_monthly_cents IS NULL OR r.cleaning_size_confirmation NOT IN ('confirmed','not_needed') THEN RAISE EXCEPTION 'cleaning_size_not_approved'; END IF;
 SELECT jsonb_agg(CASE WHEN x->>'service'='cleaning' THEN x||jsonb_build_object('size',r.cleaning_verified_size::integer,'monthly',r.cleaning_new_monthly_cents::numeric/100) ELSE x END ORDER BY ord) INTO updated_lines FROM jsonb_array_elements(r.lines) WITH ORDINALITY AS a(x,ord);
 SELECT round(coalesce(sum((x->>'monthly')::numeric),0)*100) INTO total FROM jsonb_array_elements(updated_lines) x WHERE x->>'size'<>'quote';
 UPDATE public.reservations SET lines=updated_lines,monthly_cents=total,quote=coalesce(quote,'{}')||jsonb_build_object('homeSqFt',r.cleaning_measured_sqft,'bathrooms',r.cleaning_verified_bathrooms::text,'cleaningRange',NULL),updated_at=now() WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION public.cleaning_apply_verified_quote(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cleaning_apply_verified_quote(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_cleaning_verify(_reservation uuid,_sqft integer,_baths numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reservations; verified text; line jsonb; amount integer; oldamount integer; confirmation text; tok text;
BEGIN
 IF NOT public.current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _sqft IS NULL OR _sqft<1 OR _sqft>100000 OR _baths IS NULL OR _baths<0 OR _baths>20 THEN RAISE EXCEPTION 'invalid_measurement'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=_reservation FOR UPDATE;
 IF NOT FOUND OR NOT ('cleaning'=ANY(r.services)) OR r.status NOT IN ('reserved','invited') THEN RAISE EXCEPTION 'reservation_not_verifiable'; END IF;
 verified:=public.cleaning_size_from_sqft(_sqft,_baths);
 SELECT x INTO line FROM jsonb_array_elements(r.lines) x WHERE x->>'service'='cleaning';
 IF line IS NULL THEN RAISE EXCEPTION 'cleaning_line_missing'; END IF;
 oldamount:=round((line->>'monthly')::numeric*100);
 IF verified='custom' THEN confirmation:='pending'; ELSE
 SELECT price_cents INTO amount FROM public.stripe_catalog WHERE canon_key=(CASE verified WHEN '4' THEN 'clean_estate' WHEN '5' THEN 'clean_estateplus' ELSE 'clean_'||verified END)||'_'||(line->>'cadence') AND rate_card_version=coalesce(r.rate_card_version,1) AND active AND coalesce(billing_period,'monthly')='monthly' LIMIT 1;
 IF amount IS NULL THEN RAISE EXCEPTION 'locked_catalog_price_missing'; END IF;
 confirmation:=CASE WHEN oldamount IS NULL OR amount>oldamount THEN 'pending' ELSE 'not_needed' END;
 END IF;
 tok:=CASE WHEN confirmation='pending' AND verified<>'custom' THEN encode(extensions.gen_random_bytes(24),'hex') ELSE NULL END;
 UPDATE public.reservations SET cleaning_measured_sqft=_sqft,cleaning_verified_bathrooms=_baths,cleaning_verified_size=verified,cleaning_verified_at=now(),cleaning_verified_by=auth.uid(),cleaning_size_confirmation=confirmation,cleaning_confirm_token=tok,cleaning_confirmed_at=NULL,cleaning_old_monthly_cents=oldamount,cleaning_new_monthly_cents=amount,cleaning_team_ready=CASE WHEN cleaning_verified_size IS DISTINCT FROM verified THEN false ELSE cleaning_team_ready END,updated_at=now() WHERE id=r.id;
 IF confirmation='not_needed' THEN PERFORM public.cleaning_apply_verified_quote(r.id); END IF;
 RETURN jsonb_build_object('verified_size',verified,'confirmation',confirmation,'old_monthly_cents',oldamount,'new_monthly_cents',amount,'token',tok);
END $$;
REVOKE ALL ON FUNCTION public.admin_cleaning_verify(uuid,integer,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_cleaning_verify(uuid,integer,numeric) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.cleaning_size_offer(_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reservations;
BEGIN
 IF _token IS NULL OR _token !~ '^[a-f0-9]{48}$' THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.reservations WHERE cleaning_confirm_token=_token AND status IN ('reserved','invited') AND cleaning_verified_at>now()-interval '14 days';
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('size',r.cleaning_verified_size,'sqft',r.cleaning_measured_sqft,'bathrooms',r.cleaning_verified_bathrooms,'old_cents',r.cleaning_old_monthly_cents,'new_cents',r.cleaning_new_monthly_cents,'confirmation',r.cleaning_size_confirmation);
END $$;
CREATE OR REPLACE FUNCTION public.cleaning_size_respond(_token text,_accept boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reservations; decision text;
BEGIN
 IF _token IS NULL OR _token !~ '^[a-f0-9]{48}$' OR _accept IS NULL THEN RAISE EXCEPTION 'invalid_response'; END IF;
 SELECT * INTO r FROM public.reservations WHERE cleaning_confirm_token=_token AND status IN ('reserved','invited') AND cleaning_verified_at>now()-interval '14 days' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'link_not_active'; END IF;
 decision:=CASE WHEN _accept THEN 'confirmed' ELSE 'declined' END;
 IF r.cleaning_size_confirmation IN ('confirmed','declined') THEN
 IF r.cleaning_size_confirmation<>decision THEN RAISE EXCEPTION 'already_responded'; END IF;
 RETURN jsonb_build_object('confirmation',decision);
 END IF;
 IF r.cleaning_size_confirmation<>'pending' OR r.cleaning_verified_size NOT IN ('1','2','3','4','5') OR r.cleaning_new_monthly_cents IS NULL THEN RAISE EXCEPTION 'offer_not_ready'; END IF;
 UPDATE public.reservations SET cleaning_size_confirmation=decision,cleaning_confirmed_at=now(),updated_at=now() WHERE id=r.id;
 IF _accept THEN PERFORM public.cleaning_apply_verified_quote(r.id); END IF;
 RETURN jsonb_build_object('confirmation',decision);
END $$;
REVOKE ALL ON FUNCTION public.cleaning_size_offer(text),public.cleaning_size_respond(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleaning_size_offer(text),public.cleaning_size_respond(text,boolean) TO anon,authenticated,service_role;