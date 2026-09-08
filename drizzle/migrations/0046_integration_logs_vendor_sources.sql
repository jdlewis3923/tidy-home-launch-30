ALTER TABLE public.integration_logs DROP CONSTRAINT IF EXISTS integration_logs_source_check;

ALTER TABLE public.integration_logs
  ADD CONSTRAINT integration_logs_source_check CHECK (
    source = ANY (ARRAY[
      'stripe','jobber','resend','twilio','zapier','meta_capi','internal',
      'brevo','documenso','checkr','google','openai'
    ])
  );