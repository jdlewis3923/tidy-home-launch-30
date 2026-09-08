DO $do$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'generate_recurring_visits';

  -- Rename the snapshot field read to a legacy fallback alias.
  def := replace(def,
    'NULLIF(x->>''contractor_pay_cents'','''')::int AS contractor_pay_cents',
    'NULLIF(x->>''contractor_pay_cents'','''')::int AS legacy_pay_cents');

  -- Declare the derived pay variable.
  def := replace(def,
    'v_extra_pay int;',
    'v_extra_pay int; v_pay int;');

  -- Derive Tier 1 base pay from canon instead of trusting the snapshot.
  def := replace(def,
    '      SELECT min(v.visit_date) INTO v_anchor',
    '      v_pay := public.contractor_visit_pay_cents(l.service, l.size_tier, l.cadence, NULL, l.surcharge_applied, v_kind);
      IF v_pay IS NULL THEN v_pay := l.legacy_pay_cents; END IF;

      SELECT min(v.visit_date) INTO v_anchor');

  -- Use the derived value in the standard-visit insert only.
  def := replace(def,
    'l.size_tier, l.cadence, l.surcharge_applied, l.contractor_pay_cents, v_kind)',
    'l.size_tier, l.cadence, l.surcharge_applied, v_pay, v_kind)');

  IF position('v_pay :=' in def) = 0 THEN
    RAISE EXCEPTION 'generate_recurring_visits patch did not match live definition';
  END IF;

  EXECUTE def;
END $do$;