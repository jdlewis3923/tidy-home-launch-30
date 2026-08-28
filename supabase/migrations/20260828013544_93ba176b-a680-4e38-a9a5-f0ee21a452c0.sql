INSERT INTO public.app_settings (key, value)
VALUES ('fl_sales_tax_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;