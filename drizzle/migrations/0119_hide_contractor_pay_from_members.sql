-- Contractor pay is never customer-readable: column-level grants exclude it.
REVOKE SELECT ON public.addon_entitlements FROM authenticated;
GRANT SELECT (id, member_id, subscription_id, type, period, slot, status, chosen_addon, attached_visit_id, addon_attach_id,
  granted_at, chosen_at, redeemed_at, expired_at, reminded_at, grant_reason) ON public.addon_entitlements TO authenticated;

REVOKE SELECT ON public.addon_catalog FROM anon, authenticated;
GRANT SELECT (id, addon_key, display_name, price_cents, services, is_active, stripe_product_id, stripe_price_id, sort_order,
  lucide_icon, created_at, updated_at, is_specialist, lookup_key, gift_eligible, rate_card_version) ON public.addon_catalog TO anon, authenticated;

REVOKE SELECT ON public.addon_attaches FROM anon, authenticated;
GRANT SELECT (id, user_id, jobber_visit_id, jobber_job_id, jobber_line_item_id, stripe_invoice_item_id, stripe_addon_price_id,
  addon_key, addon_name, addon_price_cents, service_type, status, attached_at, removed_at, completed_at, is_free, free_period,
  visit_id, entitlement_id) ON public.addon_attaches TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_gift_cost_by_month()
RETURNS TABLE(month text, gifts integer, cost_cents integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_char(redeemed_at AT TIME ZONE 'America/New_York', 'YYYY-MM'), count(*)::int, coalesce(sum(contractor_pay_cents),0)::int
  FROM public.addon_entitlements
  WHERE status = 'redeemed' AND public.has_role(auth.uid(),'admin')
  GROUP BY 1 ORDER BY 1 DESC
$$;
GRANT EXECUTE ON FUNCTION public.admin_gift_cost_by_month() TO authenticated;