-- Stable text key so the year-one calendar can be seeded idempotently and so a
-- task can be recognised across reseeds. sort_key stays the display order.
ALTER TABLE public.calendar_tasks ADD COLUMN IF NOT EXISTS task_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS calendar_tasks_task_key_uq ON public.calendar_tasks (task_key) WHERE task_key IS NOT NULL;