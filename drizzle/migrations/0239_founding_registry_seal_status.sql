-- Founding registry shows each home's seal delivery status.
DROP FUNCTION public.admin_founding_registry();
CREATE FUNCTION public.admin_founding_registry()
RETURNS TABLE(grant_id uuid, founding_zip text, founding_number smallint, name text, address text, email text, granted_at timestamptz, services text[], rate_card_version integer, monthly_cents integer, status text, current_zip text, seal_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT g.id, g.founding_zip, g.founding_number,
         coalesce(nullif(trim(concat_ws(' ', p.first_name, '')),''), r.first_name || ' ' || coalesce(r.last_name,'')),
         coalesce(nullif(p.address_line1,''), r.street), g.email, g.granted_at,
         coalesce(su.services::text[], r.services), g.rate_card_version,
         coalesce(su.monthly_total_cents, r.monthly_cents), g.status, coalesce(p.zip, r.zip), g.seal_status
  FROM public.founding_grants g
  LEFT JOIN public.reservations r ON r.id = g.reservation_id
  LEFT JOIN public.profiles p ON p.user_id = g.user_id
  LEFT JOIN LATERAL (SELECT * FROM public.subscriptions s WHERE s.founding_grant_id = g.id ORDER BY s.created_at DESC LIMIT 1) su ON true
  WHERE public.has_role(auth.uid(),'admin')
  ORDER BY g.founding_zip, g.founding_number
$$;
REVOKE ALL ON FUNCTION public.admin_founding_registry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_founding_registry() TO authenticated;